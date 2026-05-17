// =============================================================================
// Excel (.xlsx) export — accountant-grade financial model.
// =============================================================================
// Builds a 3-sheet workbook that follows the conventions a tier-1 consulting
// modeller or Big-Four auditor would expect:
//
//   1. Cover        — project metadata, key outputs, model legend.
//   2. Assumptions  — every input on one page. Editable Value column in BLUE.
//   3. Cashflow     — year-by-year model. Per-item rows reference Assumptions
//                     via named ranges so formulas read like "=setup_hrs *
//                     loaded_rate" rather than "=Assumptions!$C$15 * ...".
//
// Conventions baked in:
//   • Blue text  = manual input (one column, one sheet)
//   • Black text = formula
//   • Green text = cross-sheet reference
//   • Negatives shown in brackets via number format, never via -1 mult
//   • All inputs entered as positives — the Net row does the subtraction
//   • No merged cells anywhere (breaks filtering/sorting)
//   • Frozen panes so labels stay on screen while scrolling
//   • Tab colors group sheets by role (input / calc / output)
//   • Named ranges for every assumption so formulas are auditor-friendly
//
// Uses xlsx-js-style (loaded from CDN in index.html) — the maintained
// SheetJS fork that adds cell styling.
// =============================================================================

// ---------------------------------------------------------------------------
// Palette — chosen to match standard finance-modeller conventions.
// ---------------------------------------------------------------------------
const X = {
  // Inputs — light blue fill, dark blue bold text. Universal "edit me" signal.
  inputText:      "1F4E78",
  inputFill:      "DDEBF7",
  // Formulas — black on white, the default.
  formulaText:    "000000",
  // Cross-sheet links — dark green (matches accountant convention).
  linkText:       "375623",
  // Section header bands — white text on dark slate.
  headerFill:     "44546A",
  headerText:     "FFFFFF",
  // Subtotal rows — light gray-blue fill, bold.
  subtotalFill:   "EDF1F7",
  subtotalText:   "1F2937",
  // Totals (top-of-page headlines).
  totalFill:      "1F4E78",
  totalText:      "FFFFFF",
  // Muted documentation text.
  muted:          "6B6657",
  muted2:         "9C9684",
  rule:           "BFBFBF",
  ruleStrong:     "8B8B8B",
  // Tab colors.
  tabCover:       "1F4E78",
  tabAssumptions: "2E75B6",
  tabCashflow:    "44546A",
};

// ---------------------------------------------------------------------------
// Number formats — standard accountant conventions.
//   - Negatives in brackets, zero as "-", positives bare.
//   - Currency on outputs only (cover sheet headlines); cashflow uses plain
//     thousands so the eye reads the structure, not the symbols.
// ---------------------------------------------------------------------------
const FMT = {
  money:        '#,##0;(#,##0);"-"',                  // 12,345 / (12,345) / -
  moneyTotal:   '#,##0;(#,##0);"-"',                  // same; weight set via style
  moneyHeadline:'"$"#,##0;("$"#,##0);"$ -"',           // $ on cover NPV / outputs
  ratio:        '0.00"×"',                            // 1.43×
  pct:          '0.0%',
  pctFlat:      '0%',
  factor:       '0.000',                              // discount factor
  int:          '0',
  text:         '@',
  year:         '"Y"0',                               // Y1, Y2, ...
};

// ---------------------------------------------------------------------------
// Reusable styles. Build once, reference many times to keep file size small.
// ---------------------------------------------------------------------------
const F11   = { name: "Calibri", sz: 11 };
const F11B  = { name: "Calibri", sz: 11, bold: true };
const F10   = { name: "Calibri", sz: 10 };
const F10I  = { name: "Calibri", sz: 10, italic: true };
const F9M   = { name: "Consolas", sz: 9 }; // mono for ids

const ALIGN_R = { horizontal: "right",  vertical: "center" };
const ALIGN_L = { horizontal: "left",   vertical: "center" };
const ALIGN_C = { horizontal: "center", vertical: "center" };
const ALIGN_LW = { horizontal: "left", vertical: "top", wrapText: true };

const borderThin   = { style: "thin",   color: { rgb: X.rule } };
const borderMedium = { style: "medium", color: { rgb: X.ruleStrong } };

const STY = {
  // -- Generic --------------------------------------------------------------
  pageTitle: {
    font: { ...F11B, sz: 22, color: { rgb: "111111" } },
    alignment: ALIGN_L,
  },
  pageSubtitle: {
    font: { ...F11, sz: 12, italic: true, color: { rgb: X.muted } },
    alignment: ALIGN_L,
  },
  label: {
    font: { ...F11, color: { rgb: "111111" } },
    alignment: ALIGN_L,
  },
  labelMuted: {
    font: { ...F10, color: { rgb: X.muted } },
    alignment: ALIGN_L,
  },
  labelBold: {
    font: { ...F11B, color: { rgb: "111111" } },
    alignment: ALIGN_L,
  },
  // Section header band — white on slate, full row.
  sectionHeader: {
    font: { ...F11B, sz: 10.5, color: { rgb: X.headerText } },
    fill: { fgColor: { rgb: X.headerFill }, patternType: "solid" },
    alignment: { horizontal: "left", vertical: "center" },
  },
  // Column header — small caps style.
  colHeader: {
    font: { ...F10, bold: true, color: { rgb: X.muted } },
    alignment: { horizontal: "left", vertical: "center" },
    border: { bottom: borderMedium },
  },
  colHeaderRight: {
    font: { ...F10, bold: true, color: { rgb: X.muted } },
    alignment: ALIGN_R,
    border: { bottom: borderMedium },
  },
  yearHeader: {
    font: { ...F10, bold: true, color: { rgb: X.muted } },
    alignment: ALIGN_R,
    border: { bottom: borderMedium },
  },
  // -- Inputs ---------------------------------------------------------------
  input: {
    font: { ...F11, bold: true, color: { rgb: X.inputText } },
    fill: { fgColor: { rgb: X.inputFill }, patternType: "solid" },
    alignment: ALIGN_R,
    numFmt: FMT.money,
    border: {
      top:    { style: "thin", color: { rgb: "BDD7EE" } },
      bottom: { style: "thin", color: { rgb: "BDD7EE" } },
      left:   { style: "thin", color: { rgb: "BDD7EE" } },
      right:  { style: "thin", color: { rgb: "BDD7EE" } },
    },
  },
  inputPct: {
    font: { ...F11, bold: true, color: { rgb: X.inputText } },
    fill: { fgColor: { rgb: X.inputFill }, patternType: "solid" },
    alignment: ALIGN_R,
    numFmt: FMT.pct,
    border: {
      top: { style: "thin", color: { rgb: "BDD7EE" } },
      bottom: { style: "thin", color: { rgb: "BDD7EE" } },
      left: { style: "thin", color: { rgb: "BDD7EE" } },
      right: { style: "thin", color: { rgb: "BDD7EE" } },
    },
  },
  inputText: {
    font: { ...F11, bold: true, color: { rgb: X.inputText } },
    fill: { fgColor: { rgb: X.inputFill }, patternType: "solid" },
    alignment: ALIGN_L,
  },
  // -- Formula / numeric outputs --------------------------------------------
  formula: {
    font: { ...F11, color: { rgb: X.formulaText } },
    alignment: ALIGN_R,
    numFmt: FMT.money,
  },
  formulaMuted: {
    font: { ...F10, color: { rgb: X.muted } },
    alignment: ALIGN_R,
    numFmt: FMT.money,
  },
  formulaFactor: {
    font: { ...F10, color: { rgb: X.muted } },
    alignment: ALIGN_R,
    numFmt: FMT.factor,
  },
  link: {
    font: { ...F11, color: { rgb: X.linkText } },
    alignment: ALIGN_R,
    numFmt: FMT.money,
  },
  linkPct: {
    font: { ...F11, color: { rgb: X.linkText } },
    alignment: ALIGN_R,
    numFmt: FMT.pct,
  },
  subtotal: {
    font: { ...F11B, color: { rgb: X.subtotalText } },
    fill: { fgColor: { rgb: X.subtotalFill }, patternType: "solid" },
    alignment: ALIGN_R,
    numFmt: FMT.money,
    border: { top: borderThin },
  },
  subtotalLabel: {
    font: { ...F11B, color: { rgb: X.subtotalText } },
    fill: { fgColor: { rgb: X.subtotalFill }, patternType: "solid" },
    alignment: ALIGN_L,
    border: { top: borderThin },
  },
  // -- Headlines on cover ---------------------------------------------------
  headline: {
    font: { ...F11B, sz: 16, color: { rgb: X.totalText } },
    fill: { fgColor: { rgb: X.totalFill }, patternType: "solid" },
    alignment: ALIGN_R,
    numFmt: FMT.moneyHeadline,
  },
  headlinePct: {
    font: { ...F11B, sz: 16, color: { rgb: X.totalText } },
    fill: { fgColor: { rgb: X.totalFill }, patternType: "solid" },
    alignment: ALIGN_R,
    numFmt: FMT.pct,
  },
  headlineRatio: {
    font: { ...F11B, sz: 16, color: { rgb: X.totalText } },
    fill: { fgColor: { rgb: X.totalFill }, patternType: "solid" },
    alignment: ALIGN_R,
    numFmt: FMT.ratio,
  },
  headlineLabel: {
    font: { ...F11B, sz: 11, color: { rgb: X.totalText } },
    fill: { fgColor: { rgb: X.totalFill }, patternType: "solid" },
    alignment: ALIGN_L,
  },
  // -- Documentation --------------------------------------------------------
  monoMuted: {
    font: { ...F9M, italic: true, color: { rgb: X.muted2 } },
    alignment: ALIGN_L,
  },
  note: {
    font: { ...F10, color: { rgb: X.muted } },
    alignment: ALIGN_LW,
  },
  legendSwatch: (rgb) => ({
    fill: { fgColor: { rgb }, patternType: "solid" },
    border: {
      top: { style: "thin", color: { rgb: "999999" } },
      bottom: { style: "thin", color: { rgb: "999999" } },
      left: { style: "thin", color: { rgb: "999999" } },
      right: { style: "thin", color: { rgb: "999999" } },
    },
  }),
};

// ---------------------------------------------------------------------------
// Cell-writing helpers — keep the sheet-build code declarative.
// ---------------------------------------------------------------------------

function cellAddr(r, c) { return XLSX.utils.encode_cell({ r, c }); }
function cellRange(r1, c1, r2, c2) {
  return `${cellAddr(r1, c1)}:${cellAddr(r2, c2)}`;
}

function set(ws, r, c, opts) {
  const addr = cellAddr(r, c);
  const cell = ws[addr] || {};
  if (opts.formula != null) {
    cell.f = opts.formula;
    cell.t = "n";
    // Provide a placeholder value so the cell renders even before Excel
    // recomputes — also keeps the file valid for previewers that don't
    // recompute formulas.
    if (cell.v == null) cell.v = 0;
  } else if (opts.value != null) {
    cell.v = opts.value;
    cell.t = typeof opts.value === "number" ? "n" : "s";
  } else {
    cell.v = "";
    cell.t = "s";
  }
  if (opts.style) cell.s = opts.style;
  ws[addr] = cell;

  // Expand !ref to include this cell.
  if (!ws["!ref"]) {
    ws["!ref"] = `${addr}:${addr}`;
  } else {
    const range = XLSX.utils.decode_range(ws["!ref"]);
    range.s.r = Math.min(range.s.r, r);
    range.s.c = Math.min(range.s.c, c);
    range.e.r = Math.max(range.e.r, r);
    range.e.c = Math.max(range.e.c, c);
    ws["!ref"] = XLSX.utils.encode_range(range);
  }
}

function blankRow(ws, r, fromC, toC, style) {
  // Apply a background style to a row of empty cells. Used for section
  // header bands so the fill extends across the page.
  for (let c = fromC; c <= toC; c++) {
    if (!ws[cellAddr(r, c)]) set(ws, r, c, { value: "", style });
  }
}

// ---------------------------------------------------------------------------
// Formula translation: gross string → Excel formula body using named ranges.
// SheetJS stores formulas in cell.f without the leading "=", so this returns
// just the expression. Our gross strings already use arithmetic operators,
// parens, numbers, and assumption ids that we'll register as defined names,
// so the translation is essentially a passthrough.
// ---------------------------------------------------------------------------
function grossToFormula(src) {
  if (src == null) return "0";
  const s = String(src).trim();
  if (s === "" || s === "0") return "0";
  return s;
}

// ---------------------------------------------------------------------------
// Sheet: Assumptions — every input on one page, alphabetised by group.
// Returns { ws, assumptionRow: id -> 1-based row number of its Value cell }.
// ---------------------------------------------------------------------------
function buildAssumptionsSheet(assumptions) {
  const ws = {};
  // Column index map:
  //   A(0) = spacer (narrow), B(1) = Label, C(2) = Value [EDITABLE],
  //   D(3) = Unit, E(4) = Group, F(5) = ID, G(6) = Source & rationale
  const COL = { SP: 0, LABEL: 1, VALUE: 2, UNIT: 3, GROUP: 4, ID: 5, NOTES: 6 };
  const HEADER_ROW = 4;
  const FIRST_DATA_ROW = 5;

  // Page title.
  set(ws, 0, COL.LABEL, { value: "Assumptions", style: STY.pageTitle });
  set(ws, 1, COL.LABEL, {
    value: "Inputs that drive the model. Edit the Value column (blue cells) to test alternatives. All other sheets reference these via named ranges.",
    style: STY.pageSubtitle,
  });

  // Section band across data columns.
  blankRow(ws, HEADER_ROW - 1, COL.SP, COL.NOTES, STY.sectionHeader);
  set(ws, HEADER_ROW - 1, COL.LABEL, { value: "INPUTS", style: STY.sectionHeader });

  // Column headers.
  set(ws, HEADER_ROW, COL.LABEL,  { value: "Label",          style: STY.colHeader });
  set(ws, HEADER_ROW, COL.VALUE,  { value: "Value",          style: STY.colHeaderRight });
  set(ws, HEADER_ROW, COL.UNIT,   { value: "Unit",           style: STY.colHeader });
  set(ws, HEADER_ROW, COL.GROUP,  { value: "Group",          style: STY.colHeader });
  set(ws, HEADER_ROW, COL.ID,     { value: "ID (named range)", style: STY.colHeader });
  set(ws, HEADER_ROW, COL.NOTES,  { value: "Source & rationale", style: STY.colHeader });

  // Sort by group → preserve config order within group.
  const byGroup = new Map();
  for (const a of assumptions) {
    const g = a.group || "Other";
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(a);
  }
  const ordered = [];
  for (const [, list] of byGroup) for (const a of list) ordered.push(a);

  const assumptionRow = {}; // id -> 1-based row in this sheet
  let r = FIRST_DATA_ROW;
  for (const a of ordered) {
    set(ws, r, COL.LABEL, { value: a.label, style: STY.label });

    // Value cell — the only editable cell on the sheet. Pick percent vs
    // number format from the unit hint.
    const isPctUnit = (a.unit === "%" || a.unit === "pp");
    const valueStyle = isPctUnit
      ? { ...STY.input, numFmt: a.unit === "%" ? FMT.pctFlat : FMT.int }
      : STY.input;
    set(ws, r, COL.VALUE, { value: a.value, style: valueStyle });

    set(ws, r, COL.UNIT, { value: a.unit || "", style: STY.labelMuted });
    set(ws, r, COL.GROUP, { value: a.group || "", style: STY.labelMuted });
    set(ws, r, COL.ID, { value: a.id, style: STY.monoMuted });

    set(ws, r, COL.NOTES, {
      value: a.source ? `Source: ${a.source}` : "",
      style: STY.note,
    });

    assumptionRow[a.id] = r + 1; // 1-based for Excel ref
    r++;
  }

  // -- Sheet metadata: column widths, frozen panes, hide gridlines --------
  ws["!cols"] = [
    { wch: 2 },   // A: spacer
    { wch: 34 },  // B: Label
    { wch: 12 },  // C: Value
    { wch: 6 },   // D: Unit
    { wch: 18 },  // E: Group
    { wch: 24 },  // F: ID
    { wch: 70 },  // G: Source & rationale
  ];
  ws["!rows"] = [];
  ws["!rows"][0] = { hpt: 30 };
  // Per-data-row taller to accommodate wrapped Source/Rationale text.
  for (let i = FIRST_DATA_ROW; i < r; i++) ws["!rows"][i] = { hpt: 36 };

  // Freeze the header rows + the Label column so scrolling keeps context.
  ws["!views"] = [{
    state: "frozen",
    xSplit: 2,                       // freeze columns A, B
    ySplit: HEADER_ROW + 1,          // freeze through header row
    topLeftCell: cellAddr(HEADER_ROW + 1, 2),
    showGridLines: false,
    activeCell: cellAddr(FIRST_DATA_ROW, COL.VALUE),
  }];

  return { ws, assumptionRow };
}

// ---------------------------------------------------------------------------
// Sheet: Cashflow — the model. Year-as-columns, line-items-as-rows.
//
// Returns { ws, refs: { totalsRow, npvCell, bcrCell, irrCell, ... } }
// for cross-sheet references on the Cover.
// ---------------------------------------------------------------------------
function buildCashflowSheet(items, assumptions, model, A, horizon, projectName) {
  const ws = {};

  const H = horizon;
  // Column index map: dynamic — year columns inserted between fixed left/right.
  const COL = { SP: 0, LABEL: 1, ID: 2 };
  COL.YEAR_FIRST = 3;
  COL.YEAR_LAST  = 3 + H - 1;
  COL.TOTAL      = COL.YEAR_LAST + 1;
  COL.PV         = COL.YEAR_LAST + 2;
  COL.NOTE       = COL.YEAR_LAST + 3;
  const LAST_C = COL.NOTE;

  let r = 0;

  // Title.
  set(ws, r++, COL.LABEL, { value: projectName, style: STY.pageTitle });
  set(ws, r++, COL.LABEL, {
    value: "Year-by-year cashflow model",
    style: STY.pageSubtitle,
  });
  r++; // blank

  // ---- PARAMETERS section ------------------------------------------------
  blankRow(ws, r, COL.SP, LAST_C, STY.sectionHeader);
  set(ws, r, COL.LABEL, { value: "PARAMETERS", style: STY.sectionHeader });
  r++;
  set(ws, r, COL.LABEL, { value: "Discount rate", style: STY.label });
  // Green link to Assumptions sheet.
  set(ws, r, COL.ID, { formula: "discount_rate", style: STY.linkPct });
  set(ws, r, COL.NOTE, {
    value: "Named range → Assumptions sheet. Edit value there.",
    style: STY.labelMuted,
  });
  r++;
  set(ws, r, COL.LABEL, { value: "Horizon (years)", style: STY.label });
  set(ws, r, COL.ID, { value: H, style: { ...STY.formula, numFmt: FMT.int } });
  r++;
  r++; // blank

  // ---- PERIOD STRUCTURE --------------------------------------------------
  blankRow(ws, r, COL.SP, LAST_C, STY.sectionHeader);
  set(ws, r, COL.LABEL, { value: "PERIOD STRUCTURE", style: STY.sectionHeader });
  r++;

  // Year header row.
  set(ws, r, COL.LABEL, { value: "Year", style: STY.colHeader });
  for (let y = 0; y < H; y++) {
    set(ws, r, COL.YEAR_FIRST + y, {
      value: y + 1,
      style: { ...STY.yearHeader, numFmt: FMT.year },
    });
  }
  set(ws, r, COL.TOTAL, { value: "Total", style: STY.colHeaderRight });
  set(ws, r, COL.PV,    { value: "PV",    style: STY.colHeaderRight });
  const yearHeaderRow = r;
  r++;

  // Period t row (0..H-1).
  set(ws, r, COL.LABEL, { value: "Period (t)", style: STY.labelMuted });
  for (let y = 0; y < H; y++) {
    set(ws, r, COL.YEAR_FIRST + y, {
      value: y,
      style: { ...STY.formulaFactor, numFmt: FMT.int },
    });
  }
  r++;

  // Discount factor row — referenced by every PV formula below.
  set(ws, r, COL.LABEL, { value: "Discount factor", style: STY.labelMuted });
  const discFactorRow = r;
  for (let y = 0; y < H; y++) {
    if (y === 0) {
      set(ws, r, COL.YEAR_FIRST + y, { value: 1, style: STY.formulaFactor });
    } else {
      // Chain off previous so multi-decade horizons stay precise.
      const prev = cellAddr(r, COL.YEAR_FIRST + y - 1);
      set(ws, r, COL.YEAR_FIRST + y, {
        formula: `${prev}/(1+discount_rate)`,
        style: STY.formulaFactor,
      });
    }
  }
  r++;
  r++; // blank

  // ---- Helper: render a section of items (benefits or costs) ------------
  // Returns { firstDataRow, totalsRow } for downstream subtotal refs.
  const renderItemBlock = (title, itemList) => {
    blankRow(ws, r, COL.SP, LAST_C, STY.sectionHeader);
    set(ws, r, COL.LABEL, { value: title, style: STY.sectionHeader });
    r++;

    // Column subheaders for this block.
    set(ws, r, COL.LABEL, { value: "Description", style: STY.colHeader });
    set(ws, r, COL.ID,    { value: "Item ID",     style: STY.colHeader });
    for (let y = 0; y < H; y++) {
      set(ws, r, COL.YEAR_FIRST + y, { value: `Y${y + 1}`, style: STY.colHeaderRight });
    }
    set(ws, r, COL.TOTAL, { value: "Total", style: STY.colHeaderRight });
    set(ws, r, COL.PV,    { value: "PV",    style: STY.colHeaderRight });
    r++;

    const firstDataRow = r;
    for (const it of itemList) {
      set(ws, r, COL.LABEL, { value: it.name, style: STY.label });
      set(ws, r, COL.ID, { value: it._grossSrc ? it.id : it.id, style: STY.monoMuted });

      // Resolve gross formula text. Prefer the original source string;
      // fall back to a 0 cell for items lacking it.
      const grossSrc = it._grossSrc;
      const startYear = it.startYear || 1;
      const lump = !!it.lump;
      const endYear = lump ? startYear : H; // (no horizonOverride in current schema)

      for (let y = 0; y < H; y++) {
        const yearIdx = y + 1;
        const active = (yearIdx >= startYear) && (yearIdx <= endYear);
        if (!active || !grossSrc || String(grossSrc).trim() === "" || String(grossSrc).trim() === "0") {
          set(ws, r, COL.YEAR_FIRST + y, { value: 0, style: STY.formula });
        } else {
          set(ws, r, COL.YEAR_FIRST + y, { formula: grossToFormula(grossSrc), style: STY.formula });
        }
      }

      // Total = SUM of year cells.
      const yRange = cellRange(r, COL.YEAR_FIRST, r, COL.YEAR_LAST);
      set(ws, r, COL.TOTAL, {
        formula: `SUM(${yRange})`,
        style: STY.formula,
      });
      // PV = SUMPRODUCT of year cells × discount factor row.
      const dfRange = cellRange(discFactorRow, COL.YEAR_FIRST, discFactorRow, COL.YEAR_LAST);
      set(ws, r, COL.PV, {
        formula: `SUMPRODUCT(${yRange},${dfRange})`,
        style: STY.formula,
      });

      // Right-margin note: the formula in plain text so the auditor can
      // read it without clicking a cell. Truncated if very long.
      if (grossSrc) {
        const noteText = grossSrc.length > 90 ? grossSrc.slice(0, 87) + "…" : grossSrc;
        set(ws, r, COL.NOTE, { value: noteText, style: STY.labelMuted });
      }
      r++;
    }
    const lastDataRow = r - 1;

    // Subtotal row.
    set(ws, r, COL.LABEL, { value: `Total ${title.toLowerCase()}`, style: STY.subtotalLabel });
    set(ws, r, COL.ID, { value: "", style: STY.subtotal });
    for (let y = 0; y < H; y++) {
      const yRange = cellRange(firstDataRow, COL.YEAR_FIRST + y, lastDataRow, COL.YEAR_FIRST + y);
      set(ws, r, COL.YEAR_FIRST + y, {
        formula: `SUM(${yRange})`,
        style: STY.subtotal,
      });
    }
    const totalRange = cellRange(firstDataRow, COL.TOTAL, lastDataRow, COL.TOTAL);
    set(ws, r, COL.TOTAL, { formula: `SUM(${totalRange})`, style: STY.subtotal });
    const pvRange = cellRange(firstDataRow, COL.PV, lastDataRow, COL.PV);
    set(ws, r, COL.PV, { formula: `SUM(${pvRange})`, style: STY.subtotal });
    set(ws, r, COL.NOTE, { value: "", style: STY.subtotal });

    const totalsRow = r;
    r++;
    return { firstDataRow, lastDataRow, totalsRow };
  };

  // ---- BENEFITS ----------------------------------------------------------
  const benefits = items.filter(i => i.kind === "benefit" && (i._grossSrc || "0") !== "0");
  // Skip qualitative items with formula "0" — they contribute nothing
  // numerically and add noise to the audit view.
  const benefitsBlock = renderItemBlock("BENEFITS", benefits);
  r++; // blank

  // ---- COSTS -------------------------------------------------------------
  const costs = items.filter(i => i.kind === "cost");
  const costsBlock = renderItemBlock("COSTS", costs);
  r++; // blank

  // ---- NET CASHFLOW ------------------------------------------------------
  blankRow(ws, r, COL.SP, LAST_C, STY.sectionHeader);
  set(ws, r, COL.LABEL, { value: "NET CASHFLOW", style: STY.sectionHeader });
  r++;

  // Net per year.
  set(ws, r, COL.LABEL, { value: "Net per year", style: STY.labelBold });
  const netRow = r;
  for (let y = 0; y < H; y++) {
    const bCell = cellAddr(benefitsBlock.totalsRow, COL.YEAR_FIRST + y);
    const cCell = cellAddr(costsBlock.totalsRow, COL.YEAR_FIRST + y);
    set(ws, r, COL.YEAR_FIRST + y, {
      formula: `${bCell}-${cCell}`,
      style: STY.formula,
    });
  }
  set(ws, r, COL.TOTAL, {
    formula: `SUM(${cellRange(r, COL.YEAR_FIRST, r, COL.YEAR_LAST)})`,
    style: STY.formula,
  });
  set(ws, r, COL.PV, {
    formula: `SUMPRODUCT(${cellRange(r, COL.YEAR_FIRST, r, COL.YEAR_LAST)},${cellRange(discFactorRow, COL.YEAR_FIRST, discFactorRow, COL.YEAR_LAST)})`,
    style: STY.formula,
  });
  r++;

  // Discounted net per year.
  set(ws, r, COL.LABEL, { value: "Discounted net", style: STY.labelMuted });
  const discNetRow = r;
  for (let y = 0; y < H; y++) {
    const netCell  = cellAddr(netRow, COL.YEAR_FIRST + y);
    const dfCell   = cellAddr(discFactorRow, COL.YEAR_FIRST + y);
    set(ws, r, COL.YEAR_FIRST + y, {
      formula: `${netCell}*${dfCell}`,
      style: STY.formulaMuted,
    });
  }
  set(ws, r, COL.TOTAL, {
    formula: `SUM(${cellRange(r, COL.YEAR_FIRST, r, COL.YEAR_LAST)})`,
    style: STY.formulaMuted,
  });
  set(ws, r, COL.PV, { value: "", style: STY.formulaMuted });
  r++;

  // Cumulative discounted.
  set(ws, r, COL.LABEL, { value: "Cumulative", style: STY.labelMuted });
  for (let y = 0; y < H; y++) {
    if (y === 0) {
      set(ws, r, COL.YEAR_FIRST + y, {
        formula: cellAddr(discNetRow, COL.YEAR_FIRST + y),
        style: STY.formulaMuted,
      });
    } else {
      const prev = cellAddr(r, COL.YEAR_FIRST + y - 1);
      const cur  = cellAddr(discNetRow, COL.YEAR_FIRST + y);
      set(ws, r, COL.YEAR_FIRST + y, {
        formula: `${prev}+${cur}`,
        style: STY.formulaMuted,
      });
    }
  }
  r++;
  r++; // blank

  // ---- SUMMARY METRICS --------------------------------------------------
  blankRow(ws, r, COL.SP, LAST_C, STY.sectionHeader);
  set(ws, r, COL.LABEL, { value: "SUMMARY METRICS", style: STY.sectionHeader });
  r++;

  set(ws, r, COL.LABEL, { value: "Net present value (NPV)", style: STY.labelBold });
  const npvCell = cellAddr(netRow, COL.PV);
  set(ws, r, COL.YEAR_FIRST, { formula: npvCell, style: { ...STY.subtotal, numFmt: FMT.moneyHeadline } });
  const summaryNpvRow = r;
  set(ws, r, COL.NOTE, {
    value: "= PV of net cashflow row above.",
    style: STY.labelMuted,
  });
  r++;

  set(ws, r, COL.LABEL, { value: "Benefit-cost ratio (BCR)", style: STY.labelBold });
  const benefitsPvCell = cellAddr(benefitsBlock.totalsRow, COL.PV);
  const costsPvCell = cellAddr(costsBlock.totalsRow, COL.PV);
  set(ws, r, COL.YEAR_FIRST, {
    formula: `IFERROR(${benefitsPvCell}/${costsPvCell},0)`,
    style: { ...STY.subtotal, numFmt: FMT.ratio },
  });
  const summaryBcrRow = r;
  set(ws, r, COL.NOTE, {
    value: `= ${benefitsPvCell} / ${costsPvCell}. Above 1.00× means benefits outweigh costs.`,
    style: STY.labelMuted,
  });
  r++;

  set(ws, r, COL.LABEL, { value: "Internal rate of return (IRR)", style: STY.labelBold });
  const netRange = cellRange(netRow, COL.YEAR_FIRST, netRow, COL.YEAR_LAST);
  set(ws, r, COL.YEAR_FIRST, {
    formula: `IFERROR(IRR(${netRange},0),0)`,
    style: { ...STY.subtotal, numFmt: FMT.pct },
  });
  const summaryIrrRow = r;
  set(ws, r, COL.NOTE, {
    value: `= IRR of net per year. Shows 0% if no sign change.`,
    style: STY.labelMuted,
  });
  r++;

  // -- Column widths -------------------------------------------------------
  ws["!cols"] = [];
  ws["!cols"][COL.SP]     = { wch: 2 };
  ws["!cols"][COL.LABEL]  = { wch: 38 };
  ws["!cols"][COL.ID]     = { wch: 22 };
  for (let y = 0; y < H; y++) ws["!cols"][COL.YEAR_FIRST + y] = { wch: 12 };
  ws["!cols"][COL.TOTAL]  = { wch: 13 };
  ws["!cols"][COL.PV]     = { wch: 13 };
  ws["!cols"][COL.NOTE]   = { wch: 46 };

  // Row heights (title row taller).
  ws["!rows"] = [{ hpt: 28 }];

  // Freeze the title + parameters + period structure, plus the label column.
  ws["!views"] = [{
    state: "frozen",
    xSplit: COL.YEAR_FIRST,           // freeze label + id columns
    ySplit: yearHeaderRow + 3,        // freeze through discount-factor row
    topLeftCell: cellAddr(yearHeaderRow + 3, COL.YEAR_FIRST),
    showGridLines: false,
    activeCell: cellAddr(summaryNpvRow, COL.YEAR_FIRST),
  }];

  return {
    ws,
    refs: {
      npvCell:    cellAddr(summaryNpvRow, COL.YEAR_FIRST),
      bcrCell:    cellAddr(summaryBcrRow, COL.YEAR_FIRST),
      irrCell:    cellAddr(summaryIrrRow, COL.YEAR_FIRST),
      benefitsPv: benefitsPvCell,
      costsPv:    costsPvCell,
      netRowFirstYear: cellAddr(netRow, COL.YEAR_FIRST),
      netRowLastYear:  cellAddr(netRow, COL.YEAR_LAST),
      benefitsTotalRow: benefitsBlock.totalsRow,
      costsTotalRow:    costsBlock.totalsRow,
    },
  };
}

// ---------------------------------------------------------------------------
// Sheet: Cover — title page + headline outputs + legend + how-to.
// ---------------------------------------------------------------------------
function buildCoverSheet({
  projectName, projectDescription, today,
  refs,
}) {
  const ws = {};

  const COL = { SP: 0, LABEL: 1, VALUE: 2, NOTE: 3 };

  let r = 0;
  // Title block.
  set(ws, r++, COL.LABEL, { value: projectName, style: STY.pageTitle });
  set(ws, r++, COL.LABEL, {
    value: projectDescription || "Interactive business case",
    style: STY.pageSubtitle,
  });
  r++; // blank

  // KEY OUTPUTS — the only numbers most readers will ever see.
  blankRow(ws, r, COL.SP, COL.NOTE, STY.sectionHeader);
  set(ws, r, COL.LABEL, { value: "KEY OUTPUTS", style: STY.sectionHeader });
  r++;
  r++; // blank

  // NPV (big headline).
  set(ws, r, COL.LABEL, { value: "Net present value (NPV)", style: STY.headlineLabel });
  set(ws, r, COL.VALUE, {
    formula: `Cashflow!${refs.npvCell}`,
    style: STY.headline,
  });
  set(ws, r, COL.NOTE, {
    value: "Sum of discounted net cashflows over the horizon.",
    style: STY.note,
  });
  r++;

  // BCR.
  set(ws, r, COL.LABEL, { value: "Benefit-cost ratio (BCR)", style: STY.label });
  set(ws, r, COL.VALUE, {
    formula: `Cashflow!${refs.bcrCell}`,
    style: { ...STY.link, numFmt: FMT.ratio },
  });
  set(ws, r, COL.NOTE, {
    value: "PV(benefits) ÷ PV(costs). Above 1.00× means benefits outweigh costs.",
    style: STY.note,
  });
  r++;

  // IRR.
  set(ws, r, COL.LABEL, { value: "Internal rate of return (IRR)", style: STY.label });
  set(ws, r, COL.VALUE, {
    formula: `Cashflow!${refs.irrCell}`,
    style: { ...STY.link, numFmt: FMT.pct },
  });
  set(ws, r, COL.NOTE, {
    value: "Discount rate at which NPV would equal zero.",
    style: STY.note,
  });
  r++;
  r++; // blank

  // BASIS.
  blankRow(ws, r, COL.SP, COL.NOTE, STY.sectionHeader);
  set(ws, r, COL.LABEL, { value: "BASIS", style: STY.sectionHeader });
  r++;
  r++;
  set(ws, r, COL.LABEL, { value: "Discount rate", style: STY.label });
  set(ws, r, COL.VALUE, { formula: "discount_rate", style: STY.linkPct });
  set(ws, r, COL.NOTE,  { value: "Linked from Assumptions sheet.", style: STY.labelMuted });
  r++;
  set(ws, r, COL.LABEL, { value: "Generated", style: STY.label });
  set(ws, r, COL.VALUE, { value: today, style: STY.labelMuted });
  set(ws, r, COL.NOTE,  { value: "CBAgent · models.teleios.au", style: STY.labelMuted });
  r++;
  r++;

  // HOW TO USE.
  blankRow(ws, r, COL.SP, COL.NOTE, STY.sectionHeader);
  set(ws, r, COL.LABEL, { value: "HOW TO USE", style: STY.sectionHeader });
  r++;
  r++;
  const howTo = [
    ["Edit values in blue.",       "Only the Value column on the Assumptions sheet accepts edits. Every other number is a formula."],
    ["Watch the model recompute.", "All sheets update automatically when you change an input."],
    ["See Cashflow for the math.", "Each line item's per-year cashflow is a formula referencing the named assumptions."],
    ["Read formulas as English.",  "Assumption IDs are registered as Excel named ranges, so a formula reads = setup_hrs * loaded_rate rather than = Assumptions!C15 * C19."],
  ];
  for (const [head, body] of howTo) {
    set(ws, r, COL.LABEL, { value: head, style: STY.labelBold });
    set(ws, r, COL.VALUE, { value: "", style: STY.label });
    set(ws, r, COL.NOTE,  { value: body, style: STY.note });
    r++;
  }
  r++;

  // CONVENTIONS / legend.
  blankRow(ws, r, COL.SP, COL.NOTE, STY.sectionHeader);
  set(ws, r, COL.LABEL, { value: "CONVENTIONS", style: STY.sectionHeader });
  r++;
  r++;
  const legend = [
    ["Blue",  X.inputFill, X.inputText, true,  "Input cell. Type to change. Lives only on the Assumptions sheet."],
    ["Black", "FFFFFF",    X.formulaText, false, "Formula. Derived from inputs — read-only by convention."],
    ["Green", "FFFFFF",    X.linkText,  false, "Reference to another sheet or named range."],
    ["Gray",  "FFFFFF",    X.muted,     false, "Label or annotation. Not a calculation."],
    ["(123)", "FFFFFF",    "C00000",    false, "Negative number — shown in brackets, never with a minus sign."],
  ];
  for (const [name, fill, ink, fillIt, body] of legend) {
    set(ws, r, COL.LABEL, {
      value: name,
      style: {
        font: { ...F11B, sz: 11, color: { rgb: ink }, bold: true },
        fill: fillIt ? { fgColor: { rgb: fill }, patternType: "solid" } : undefined,
        alignment: ALIGN_C,
        border: {
          top: { style: "thin", color: { rgb: "BFBFBF" } },
          bottom: { style: "thin", color: { rgb: "BFBFBF" } },
          left: { style: "thin", color: { rgb: "BFBFBF" } },
          right: { style: "thin", color: { rgb: "BFBFBF" } },
        },
      },
    });
    set(ws, r, COL.VALUE, { value: "", style: STY.label });
    set(ws, r, COL.NOTE, { value: body, style: STY.note });
    r++;
  }

  // Layout.
  ws["!cols"] = [
    { wch: 2 },   // A
    { wch: 32 },  // B Label
    { wch: 20 },  // C Value
    { wch: 70 },  // D Note
  ];
  ws["!rows"] = [{ hpt: 34 }];
  ws["!views"] = [{
    state: "frozen", xSplit: 0, ySplit: 0,
    showGridLines: false,
  }];

  return ws;
}

// ---------------------------------------------------------------------------
// Main entry. Builds workbook, registers named ranges, downloads.
// ---------------------------------------------------------------------------
function exportXlsx({
  items, assumptions, model, A, irrValue,
  projectName, projectShortName, projectDescription,
  horizon,
}) {
  if (typeof XLSX === "undefined") {
    console.error("[CBAgent] xlsx-js-style not loaded.");
    alert("Excel export library failed to load. Check your network and refresh.");
    return;
  }
  const wb = XLSX.utils.book_new();

  // Build sheets in order of cross-reference dependency: Cashflow needs the
  // Assumptions row map (to attach named ranges); Cover needs Cashflow's
  // output cells. Append in display order though: Cover first.
  const { ws: wsAssumptions, assumptionRow } = buildAssumptionsSheet(assumptions);
  const { ws: wsCashflow, refs: cashRefs } = buildCashflowSheet(
    items, assumptions, model, A, horizon,
    projectShortName || projectName
  );
  const today = new Date().toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
  });
  const wsCover = buildCoverSheet({
    projectName: projectShortName || projectName,
    projectDescription,
    today,
    refs: cashRefs,
  });

  XLSX.utils.book_append_sheet(wb, wsCover,       "Cover");
  XLSX.utils.book_append_sheet(wb, wsAssumptions, "Assumptions");
  XLSX.utils.book_append_sheet(wb, wsCashflow,    "Cashflow");

  // Tab colors — group-by-role visual cue.
  if (wb.Workbook == null) wb.Workbook = {};
  if (wb.Workbook.Sheets == null) wb.Workbook.Sheets = [];
  wb.Workbook.Sheets[0] = { name: "Cover",       Hidden: 0, TabColor: { rgb: X.tabCover } };
  wb.Workbook.Sheets[1] = { name: "Assumptions", Hidden: 0, TabColor: { rgb: X.tabAssumptions } };
  wb.Workbook.Sheets[2] = { name: "Cashflow",    Hidden: 0, TabColor: { rgb: X.tabCashflow } };

  // Defined names: one per assumption (points at its Value cell), plus the
  // headline outputs so formulas like "=npv" work from any sheet.
  wb.Workbook.Names = [];
  for (const a of assumptions) {
    const rowNum = assumptionRow[a.id];
    if (!rowNum) continue;
    wb.Workbook.Names.push({
      Name: a.id,
      Ref: `Assumptions!$C$${rowNum}`,
    });
  }
  wb.Workbook.Names.push({ Name: "npv", Ref: `Cashflow!${cashRefs.npvCell}` });
  wb.Workbook.Names.push({ Name: "bcr", Ref: `Cashflow!${cashRefs.bcrCell}` });
  wb.Workbook.Names.push({ Name: "irr", Ref: `Cashflow!${cashRefs.irrCell}` });

  // Hide the workbook-level gridlines on every sheet (per-sheet flag set
  // above; the Workbook.Views array reinforces it for some viewers).
  wb.Workbook.Views = [{ showGridLines: false }];

  const safe = (projectShortName || projectName || "cbagent")
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase();
  XLSX.writeFile(wb, `${safe}_model.xlsx`);
}

Object.assign(window, { exportXlsx });

// CSV export — Excel-compatible (.csv with UTF-8 BOM)
// All exports go through downloadCSV which adds the BOM so Excel respects unicode.

const csvEscape = (v) => {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const toCSV = (rows) =>
  rows.map(r => r.map(csvEscape).join(",")).join("\r\n");

const downloadCSV = (filename, rows) => {
  const csv = toCSV(rows);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : filename + ".csv";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
};

const fmtNum = (v) => Number.isFinite(v) ? Number(v.toFixed(2)) : "";

// ------- Per-section builders -------

const buildAssumptionsRows = (assumptions) => {
  const rows = [
    ["Assumption", "Value", "Unit", "Group", "Description", "Rationale", "Source", "Domain"],
  ];
  for (const a of assumptions) {
    rows.push([
      a.label, a.value, a.unit || "", a.group || "",
      a.description || "", a.rationale || "", a.source || "", a.domain || "",
    ]);
  }
  return rows;
};

const buildCashflowRows = (items, model, includeSoft) => {
  const yearHeader = Array.from({ length: HORIZON }, (_, y) => `Year ${y + 1}`);
  const rows = [["Cash flow by item (" + (includeSoft ? "cash + soft" : "cash only") + ")"]];
  rows.push(["Item", "Kind", "Category", ...yearHeader, "Total"]);

  const seriesFor = (i) => {
    const s = model.perItem[i.id];
    return i.kind === "benefit"
      ? s.cash.map((c, y) => c + (includeSoft ? s.soft[y] : 0))
      : s.cash;
  };

  rows.push([]);
  rows.push(["COSTS"]);
  for (const i of items.filter(i => i.kind === "cost")) {
    const v = seriesFor(i);
    rows.push([i.name, "Cost", i.category || "", ...v.map(fmtNum), fmtNum(v.reduce((a,b)=>a+b,0))]);
  }
  rows.push(["Total costs", "", "", ...model.yearTotals.cost.map(fmtNum),
            fmtNum(model.yearTotals.cost.reduce((a,b)=>a+b,0))]);

  rows.push([]);
  rows.push(["BENEFITS"]);
  for (const i of items.filter(i => i.kind === "benefit")) {
    const v = seriesFor(i);
    rows.push([i.name, "Benefit", i.category || "", ...v.map(fmtNum), fmtNum(v.reduce((a,b)=>a+b,0))]);
  }
  rows.push(["Total benefits", "", "", ...model.yearTotals.benefit.map(fmtNum),
            fmtNum(model.yearTotals.benefit.reduce((a,b)=>a+b,0))]);

  rows.push([]);
  const net = model.yearTotals.benefit.map((b, y) => b - model.yearTotals.cost[y]);
  rows.push(["Net cash flow", "", "", ...net.map(fmtNum), fmtNum(net.reduce((a,b)=>a+b,0))]);
  return rows;
};

const buildItemWaterfallRows = (items, model) => {
  const rows = [
    ["Item", "Kind", "Phase", "Start year",
     "Gross PV", "After overlap", "After phase risk", "Net PV (incremental)",
     "Cash PV", "Soft PV",
     "Overlap %", "Counterfactual capture %", "Cash realisation %",
     "Description"],
  ];
  for (const i of items) {
    const s = model.perItem[i.id];
    rows.push([
      i.name, i.kind, i.phase || "", i.startYear,
      fmtNum(s.grossPV), fmtNum(s.overlapPV), fmtNum(s.phasePV), fmtNum(s.netPV),
      fmtNum(s.cashPV), fmtNum(s.softPV),
      Math.round((i.overlap || 0) * 100),
      Math.round((i.counterfactual || 0) * 100),
      Math.round((i.cashRealisation || 0) * 100),
      i.desc || "",
    ]);
  }
  return rows;
};

const buildSummaryRows = (model, irrValue, scenario, includeSoft, projectName, A) => {
  const rows = [];
  rows.push(["Project", projectName]);
  rows.push(["Scenario", scenario]);
  rows.push(["Includes soft value", includeSoft ? "Yes" : "No"]);
  rows.push(["Discount rate", `${A.discount_rate}%`]);
  rows.push(["Horizon (years)", HORIZON]);
  rows.push([]);
  rows.push(["Metric", "Value"]);
  rows.push(["Net Present Value", fmtNum(model.npv)]);
  rows.push(["Benefit-Cost Ratio", model.bcr.toFixed(3)]);
  rows.push(["Internal Rate of Return", irrValue == null ? "—" : fmtPct(irrValue)]);
  rows.push(["Total cash benefits PV", fmtNum(model.totalCashBenefitsPV)]);
  rows.push(["Total soft benefits PV", fmtNum(model.totalSoftBenefitsPV)]);
  rows.push(["Total costs PV", fmtNum(model.totalCostsPV)]);
  return rows;
};

// ------- Public exports -------

const exportAll = ({ items, assumptions, model, A, irrValue, scenario, includeSoft, projectName }) => {
  const rows = [];
  rows.push(["CBAGENT EXPORT — " + projectName]);
  rows.push(["Generated", new Date().toISOString()]);
  rows.push([]);

  rows.push(["=== SUMMARY ==="]);
  rows.push(...buildSummaryRows(model, irrValue, scenario, includeSoft, projectName, A));
  rows.push([]);

  rows.push(["=== CASH FLOWS ==="]);
  rows.push(...buildCashflowRows(items, model, includeSoft));
  rows.push([]);

  rows.push(["=== ITEM WATERFALL ==="]);
  rows.push(...buildItemWaterfallRows(items, model));
  rows.push([]);

  rows.push(["=== ASSUMPTIONS ==="]);
  rows.push(...buildAssumptionsRows(assumptions));

  const safeName = (projectName || "cbagent").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  downloadCSV(`${safeName}_export`, rows);
};

const exportCashflow = (items, model, includeSoft) =>
  downloadCSV("cash_flows", buildCashflowRows(items, model, includeSoft));
const exportAssumptions = (assumptions) =>
  downloadCSV("assumptions", buildAssumptionsRows(assumptions));
const exportItemWaterfall = (items, model) =>
  downloadCSV("item_waterfall", buildItemWaterfallRows(items, model));

// ============================================================================
// PDF export — uses the browser's native print dialog with a dedicated
// print-only layout (PrintReport below). User picks "Save as PDF" from the
// dialog. The filename is suggested via document.title.
// ============================================================================

const printPDF = (projectName) => {
  const old = document.title;
  if (projectName) {
    const safe = String(projectName).replace(/[^\w\- ]+/g, "").trim();
    document.title = `${safe} — Business Case`;
  }
  const restore = () => {
    document.title = old;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  // Two rAFs so layout has flushed before the dialog snapshots the page.
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
};

// ============================================================================
// PrintReport — executive-style business case proposal.
// Composed of discrete sections with .print-page breaks between them.
// Uses explicit hex colours (not CSS vars) so dark-mode users still get a
// light, print-friendly document.
// ============================================================================

const P = {
  ink:     "#14130F",
  ink2:    "#2C2A24",
  muted:   "#6B6657",
  muted2:  "#948E7A",
  eyebrow: "#A8A18B",
  line:    "#E3DECE",
  lineStrong: "#D6CFB9",
  surface: "#FFFFFF",
  surfaceSoft: "#FAF8F2",
  green:   "#0B7A47",
  greenSoft: "#E6F6EE",
  red:     "#B73A4D",
  redSoft: "rgba(183,58,77,0.10)",
  serif:   '"Newsreader", ui-serif, Georgia, serif',
  sans:    '"Geist", ui-sans-serif, sans-serif',
  mono:    '"Geist Mono", ui-monospace, monospace',
};

const PrintEyebrow = ({ children }) => (
  <div style={{
    fontFamily: P.sans, fontSize: 9, fontWeight: 500, letterSpacing: "0.16em",
    textTransform: "uppercase", color: P.eyebrow,
  }}>{children}</div>
);

const PrintRule = () => (
  <div style={{ height: 1, background: P.lineStrong, margin: "10mm 0 8mm" }} />
);

const PrintReport = ({ project, scenario, scenarioLabel, scenarioDesc, model, items, assumptions, A, irrValue, includeSoft, horizon }) => {
  const benefitsRanked = React.useMemo(() => items
    .filter(i => i.kind === "benefit")
    .map(i => ({ i, pv: model.perItem[i.id].cashPV + (includeSoft ? model.perItem[i.id].softPV : 0) }))
    .sort((a, b) => b.pv - a.pv),
    [items, model, includeSoft]);
  const costsRanked = React.useMemo(() => items
    .filter(i => i.kind === "cost")
    .map(i => ({ i, pv: model.perItem[i.id].cashPV }))
    .sort((a, b) => b.pv - a.pv),
    [items, model]);
  const topBenefit = benefitsRanked[0];
  const sensitivities = React.useMemo(
    () => computeSensitivity(items, A, assumptions, { includeSoft }).slice(0, 5),
    [items, A, assumptions, includeSoft]
  );
  const npvPositive = model.npv >= 0;
  const bcrOk       = model.bcr >= 1;
  const verdict = npvPositive && bcrOk
    ? "Worth advancing"
    : npvPositive
      ? "Marginal — investigate before committing"
      : "Decline as scoped";
  const verdictColor = npvPositive && bcrOk ? P.green : npvPositive ? "#9A6A1B" : P.red;
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  // -- shared cell styles -----------------------------------------------
  const cellTh = {
    fontFamily: P.sans, fontSize: 8.5, fontWeight: 500, letterSpacing: "0.08em",
    textTransform: "uppercase", color: P.muted, textAlign: "left",
    padding: "6pt 8pt", borderBottom: `1px solid ${P.lineStrong}`,
  };
  const cellTd = {
    fontFamily: P.sans, fontSize: 10, color: P.ink, padding: "6pt 8pt",
    borderBottom: `1px solid ${P.line}`, verticalAlign: "top",
  };
  const cellTdMono = { ...cellTd, fontFamily: P.mono, textAlign: "right", whiteSpace: "nowrap" };

  // ====================================================================
  // PAGE 1 — Cover + Executive summary
  // ====================================================================
  const PageCover = (
    <section className="print-page" style={{ fontFamily: P.sans, color: P.ink }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        paddingBottom: 8, borderBottom: `1px solid ${P.line}`,
      }}>
        <PrintEyebrow>Interactive Business Case</PrintEyebrow>
        <span style={{ fontFamily: P.mono, fontSize: 9, color: P.muted2 }}>{today}</span>
      </div>

      <h1 style={{
        fontFamily: P.serif, fontWeight: 500, fontSize: 28, lineHeight: 1.15,
        letterSpacing: "-0.015em", margin: "14mm 0 4mm",
      }}>{project.name}</h1>

      <p style={{
        fontFamily: P.serif, fontStyle: "italic", color: P.ink2,
        fontSize: 14, lineHeight: 1.5, margin: "0 0 10mm", maxWidth: "170mm",
      }}>
        {npvPositive
          ? <>This proposal delivers a <strong style={{ color: P.green, fontStyle: "normal" }}>positive return</strong> of {fmtMoney(model.npv, { precise: true })} over a {horizon}-year horizon ({scenarioLabel}). Every $1 invested returns ${model.bcr.toFixed(2)} in value after waterfall adjustments.</>
          : <>This proposal shows a <strong style={{ color: P.red, fontStyle: "normal" }}>net loss</strong> of {fmtMoney(Math.abs(model.npv), { precise: true })} over a {horizon}-year horizon ({scenarioLabel}). Benefit-Cost Ratio is {model.bcr.toFixed(2)}.</>
        }
      </p>

      {/* Stat band */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
        gap: 8, marginBottom: "8mm",
      }}>
        <StatBox label="Net Present Value" value={fmtMoney(model.npv, { precise: true })} color={npvPositive ? P.green : P.red} />
        <StatBox label="Benefit-Cost Ratio" value={model.bcr.toFixed(2)} color={bcrOk ? P.green : P.red} />
        <StatBox label="Internal Rate of Return" value={irrValue == null ? "—" : fmtPct(irrValue)} color={P.ink} />
        <StatBox label="Recommendation" value={verdict} color={verdictColor} small />
      </div>

      <PrintEyebrow>The decision being weighed</PrintEyebrow>
      <p style={{
        margin: "6pt 0 0", fontSize: 10.5, lineHeight: 1.55, color: P.ink2,
      }}>{(project.description || "—").trim()}</p>

      <div style={{
        marginTop: "10mm", padding: "8pt 10pt",
        border: `1px solid ${P.lineStrong}`, borderRadius: 6,
        background: P.surfaceSoft,
      }}>
        <PrintEyebrow>{scenarioLabel}</PrintEyebrow>
        <div style={{ fontSize: 10, lineHeight: 1.5, color: P.ink2, marginTop: 4 }}>
          {scenarioDesc || "—"}
        </div>
        <div style={{
          marginTop: 6, fontFamily: P.mono, fontSize: 9, color: P.muted,
        }}>
          {horizon}-year horizon · {A.discount_rate}% discount · {includeSoft ? "cash + soft value" : "cash value only"}
        </div>
      </div>

      <Footer />
    </section>
  );

  // ====================================================================
  // PAGE 2 — Costs and benefits side by side
  // ====================================================================
  const PageWeighed = (
    <section className="print-page" style={{ fontFamily: P.sans, color: P.ink }}>
      <SectionHeader eyebrow="Section 1" title="What's being weighed" sub="Costs paid in vs. value captured back, both in present-value dollars." />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10mm", marginTop: "6mm" }}>
        <ItemColumn title="Costs" total={model.totalCostsPV} accent={P.red} list={costsRanked} model={model} includeSoft={includeSoft} />
        <ItemColumn title="Benefits" total={model.totalBenefitsPV} accent={P.green} list={benefitsRanked} model={model} includeSoft={includeSoft} />
      </div>

      {topBenefit && (
        <div className="print-avoid-break" style={{
          marginTop: "10mm", padding: "8pt 12pt",
          border: `1px solid ${P.lineStrong}`, borderRadius: 6,
          background: P.surfaceSoft,
        }}>
          <PrintEyebrow>Largest contributor</PrintEyebrow>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 4, gap: 12 }}>
            <span style={{ fontFamily: P.serif, fontSize: 16, fontWeight: 500 }}>{topBenefit.i.name}</span>
            <span style={{ fontFamily: P.mono, fontSize: 12, color: P.green }}>{fmtMoney(topBenefit.pv, { precise: true })}</span>
          </div>
          <div style={{ fontSize: 9.5, color: P.muted, marginTop: 4, lineHeight: 1.5 }}>{topBenefit.i.desc || ""}</div>
        </div>
      )}

      <Footer />
    </section>
  );

  // ====================================================================
  // PAGE 3 — Assumptions & sources
  // ====================================================================
  const PageAssumptions = (
    <section className="print-page" style={{ fontFamily: P.sans, color: P.ink }}>
      <SectionHeader eyebrow="Section 2" title="What we're assuming" sub="Every numeric input that drives the model, with its provenance. Sceptical readers should start here." />

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "6mm" }}>
        <thead><tr>
          <th style={cellTh}>Parameter</th>
          <th style={{ ...cellTh, textAlign: "right" }}>Value</th>
          <th style={cellTh}>Source</th>
          <th style={cellTh}>Rationale</th>
        </tr></thead>
        <tbody>
          {assumptions.map((a) => (
            <tr key={a.id} className="print-avoid-break">
              <td style={{ ...cellTd, width: "30%" }}>
                <div style={{ fontWeight: 500 }}>{a.label}</div>
                <div style={{ fontSize: 8.5, color: P.muted2, fontFamily: P.mono, marginTop: 1 }}>{a.id}</div>
              </td>
              <td style={{ ...cellTdMono, width: "12%", whiteSpace: "nowrap" }}>
                {typeof a.value === "number" ? a.value.toLocaleString() : a.value}
                {a.unit && <span style={{ color: P.muted2, marginLeft: 4 }}>{a.unit}</span>}
              </td>
              <td style={{ ...cellTd, width: "18%", fontSize: 9, color: P.muted }}>{a.source || "—"}</td>
              <td style={{ ...cellTd, fontSize: 9, color: P.ink2, lineHeight: 1.5 }}>{a.rationale || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Footer />
    </section>
  );

  // ====================================================================
  // PAGE 4 — Sensitivity
  // ====================================================================
  const sensMax = Math.max(...sensitivities.map(s => s.range), 1);
  const PageSensitivity = (
    <section className="print-page" style={{ fontFamily: P.sans, color: P.ink }}>
      <SectionHeader eyebrow="Section 3" title="What moves the most" sub={`The five assumptions that swing NPV the most across their plausible ranges${includeSoft ? " (including soft value)" : " (cash only)"}. Scrutinise these first.`} />

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: "6mm" }}>
        {sensitivities.map(s => {
          const lo = s.lo, hi = s.hi, base = s.base;
          // Map to a 0..100 bar around the base
          const span = Math.max(Math.abs(base - lo), Math.abs(hi - base), 1);
          const downPct = ((base - lo) / sensMax) * 45;
          const upPct   = ((hi - base) / sensMax) * 45;
          return (
            <div key={s.id} className="print-avoid-break" style={{
              display: "grid", gridTemplateColumns: "55mm 1fr 40mm",
              gap: 8, alignItems: "center",
              padding: "6pt 0", borderBottom: `1px solid ${P.line}`,
            }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 500, color: P.ink2 }}>{s.label}</div>
                <div style={{ fontSize: 8.5, color: P.muted2, fontFamily: P.mono, marginTop: 2 }}>
                  {Math.round((1 - s.loMul) * 100)}% / +{Math.round((s.hiMul - 1) * 100)}%
                </div>
              </div>
              <div style={{ position: "relative", height: 10, background: P.surfaceSoft, borderRadius: 3 }}>
                <div style={{ position: "absolute", top: 0, bottom: 0, left: `${50 - downPct}%`, width: `${downPct}%`, background: P.red, opacity: 0.7, borderRadius: "3px 0 0 3px" }} />
                <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: `${upPct}%`, background: P.green, opacity: 0.7, borderRadius: "0 3px 3px 0" }} />
                <div style={{ position: "absolute", top: -1, bottom: -1, left: "50%", width: 1, background: P.ink }} />
              </div>
              <div style={{ fontFamily: P.mono, fontSize: 9, color: P.muted, textAlign: "right" }}>
                {fmtMoney(lo)} → {fmtMoney(hi)}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: "10mm", padding: "8pt 12pt",
        border: `1px solid ${P.lineStrong}`, borderRadius: 6, background: P.surfaceSoft,
        fontSize: 9.5, color: P.ink2, lineHeight: 1.55,
      }}>
        <PrintEyebrow>Caveats</PrintEyebrow>
        <div style={{ marginTop: 4 }}>
          This model is built from declared assumptions with declared sources. Numbers are estimates,
          not guarantees. The base case shown here is one scenario among several — request the
          interactive view to test alternatives and walk through the value chain item by item.
        </div>
      </div>

      <Footer />
    </section>
  );

  return (
    <div className="print-only">
      {PageCover}
      {PageWeighed}
      {PageAssumptions}
      {PageSensitivity}
    </div>
  );
};

// -- shared bits for the report -----------------------------------------
const StatBox = ({ label, value, color, small }) => (
  <div style={{
    border: `1px solid ${P.line}`, borderRadius: 6, padding: "10pt 10pt",
    background: P.surface, breakInside: "avoid",
  }}>
    <div style={{
      fontFamily: P.sans, fontSize: 8.5, fontWeight: 500, letterSpacing: "0.10em",
      textTransform: "uppercase", color: P.muted,
    }}>{label}</div>
    <div style={{
      fontFamily: P.serif, fontWeight: 500, fontSize: small ? 13 : 20,
      color: color || P.ink, marginTop: 6, lineHeight: 1.1, letterSpacing: "-0.01em",
    }}>{value}</div>
  </div>
);

const SectionHeader = ({ eyebrow, title, sub }) => (
  <div style={{ paddingBottom: 6, borderBottom: `1px solid ${P.line}` }}>
    <PrintEyebrow>{eyebrow}</PrintEyebrow>
    <h2 style={{
      fontFamily: P.serif, fontWeight: 500, fontSize: 22, lineHeight: 1.2,
      letterSpacing: "-0.012em", margin: "6pt 0 0",
    }}>{title}</h2>
    {sub && <p style={{ margin: "6pt 0 0", color: P.muted, fontSize: 10, lineHeight: 1.5 }}>{sub}</p>}
  </div>
);

const ItemColumn = ({ title, total, accent, list, model, includeSoft }) => (
  <div>
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
      <PrintEyebrow>{title}</PrintEyebrow>
      <span style={{ fontFamily: P.mono, fontSize: 10, color: accent }}>
        {fmtMoney(total, { precise: true })}
      </span>
    </div>
    {list.map(({ i, pv }) => (
      <div key={i.id} className="print-avoid-break" style={{
        padding: "6pt 0", borderBottom: `1px solid ${P.line}`,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontFamily: P.serif, fontSize: 12, fontWeight: 500 }}>{i.name}</span>
          <span style={{ fontFamily: P.mono, fontSize: 10, color: P.ink2 }}>{fmtMoney(pv, { precise: true })}</span>
        </div>
        <div style={{ fontSize: 9, color: P.muted, marginTop: 3, lineHeight: 1.5 }}>{i.desc || ""}</div>
      </div>
    ))}
  </div>
);

const Footer = () => (
  <div style={{
    position: "absolute", bottom: "10mm", left: "16mm", right: "16mm",
    fontFamily: P.mono, fontSize: 8, color: P.muted2,
    display: "flex", justifyContent: "space-between",
    borderTop: `1px solid ${P.line}`, paddingTop: 4,
  }}>
    <span>CBAgent · interactive business case</span>
    <span>Generated locally — not a forecast</span>
  </div>
);

Object.assign(window, { exportAll, exportCashflow, exportAssumptions, exportItemWaterfall, downloadCSV, printPDF, PrintReport });

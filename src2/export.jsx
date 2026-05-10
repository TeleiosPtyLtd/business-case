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
  rows.push(["RESCHEMATIC EXPORT — " + projectName]);
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

  const safeName = (projectName || "reschematic").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  downloadCSV(`${safeName}_export`, rows);
};

const exportCashflow = (items, model, includeSoft) =>
  downloadCSV("cash_flows", buildCashflowRows(items, model, includeSoft));
const exportAssumptions = (assumptions) =>
  downloadCSV("assumptions", buildAssumptionsRows(assumptions));
const exportItemWaterfall = (items, model) =>
  downloadCSV("item_waterfall", buildItemWaterfallRows(items, model));

Object.assign(window, { exportAll, exportCashflow, exportAssumptions, exportItemWaterfall, downloadCSV });

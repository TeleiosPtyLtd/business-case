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
    ["Assumption", "Value", "Unit", "Group", "Description", "Source"],
  ];
  for (const a of assumptions) {
    rows.push([
      a.label, a.value, a.unit || "", a.group || "",
      a.description || "", a.source || "",
    ]);
  }
  return rows;
};

const buildCashflowRows = (items, model) => {
  const yearHeader = Array.from({ length: HORIZON }, (_, y) => `Year ${y + 1}`);
  const rows = [["Cash flow by item"]];
  rows.push(["Item", "Kind", ...yearHeader, "Total"]);

  const seriesFor = (i) => model.perItem[i.id].cash;

  rows.push([]);
  rows.push(["COSTS"]);
  for (const i of items.filter(i => i.kind === "cost")) {
    const v = seriesFor(i);
    rows.push([i.name, "Cost", ...v.map(fmtNum), fmtNum(v.reduce((a,b)=>a+b,0))]);
  }
  rows.push(["Total costs", "", ...model.yearTotals.cost.map(fmtNum),
            fmtNum(model.yearTotals.cost.reduce((a,b)=>a+b,0))]);

  rows.push([]);
  rows.push(["BENEFITS"]);
  for (const i of items.filter(i => i.kind === "benefit")) {
    const v = seriesFor(i);
    rows.push([i.name, "Benefit", ...v.map(fmtNum), fmtNum(v.reduce((a,b)=>a+b,0))]);
  }
  rows.push(["Total benefits", "", ...model.yearTotals.benefit.map(fmtNum),
            fmtNum(model.yearTotals.benefit.reduce((a,b)=>a+b,0))]);

  rows.push([]);
  const net = model.yearTotals.benefit.map((b, y) => b - model.yearTotals.cost[y]);
  rows.push(["Net cash flow", "", ...net.map(fmtNum), fmtNum(net.reduce((a,b)=>a+b,0))]);
  return rows;
};

const buildSummaryRows = (model, irrValue, projectName, A) => {
  const rows = [];
  rows.push(["Project", projectName]);
  rows.push(["Discount rate", `${A.discount_rate}%`]);
  rows.push(["Horizon (years)", HORIZON]);
  rows.push([]);
  rows.push(["Metric", "Value"]);
  rows.push(["Net Present Value", fmtNum(model.npv)]);
  rows.push(["Benefit-Cost Ratio", model.bcr.toFixed(3)]);
  rows.push(["Internal Rate of Return", irrValue == null ? "—" : fmtPct(irrValue)]);
  rows.push(["Total benefits PV", fmtNum(model.totalBenefitsPV)]);
  rows.push(["Total costs PV", fmtNum(model.totalCostsPV)]);
  return rows;
};

// ------- Public exports -------

const exportAll = ({ items, assumptions, model, A, irrValue, projectName }) => {
  const rows = [];
  rows.push(["CBAGENT EXPORT — " + projectName]);
  rows.push(["Generated", new Date().toISOString()]);
  rows.push([]);

  rows.push(["=== SUMMARY ==="]);
  rows.push(...buildSummaryRows(model, irrValue, projectName, A));
  rows.push([]);

  rows.push(["=== CASH FLOWS ==="]);
  rows.push(...buildCashflowRows(items, model));
  rows.push([]);

  rows.push(["=== ASSUMPTIONS ==="]);
  rows.push(...buildAssumptionsRows(assumptions));

  const safeName = (projectName || "cbagent").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  downloadCSV(`${safeName}_export`, rows);
};

const exportCashflow = (items, model) =>
  downloadCSV("cash_flows", buildCashflowRows(items, model));
const exportAssumptions = (assumptions) =>
  downloadCSV("assumptions", buildAssumptionsRows(assumptions));

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
  sans:    '"Hanken Grotesk", ui-sans-serif, sans-serif',
  mono:    '"IBM Plex Mono", ui-monospace, monospace',
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

// Handout-friendly money formatter — always nice-rounds, regardless of the
// app's display toggle. The PDF is meant to be scanned across the room.
const pdMoney = (v) => fmtMoney((typeof niceRound === "function" ? niceRound(v) : v), { exact: true });

const PrintReport = ({ project, model, items, assumptions, A, irrValue, horizon }) => {
  const benefitsRanked = React.useMemo(() => items
    .filter(i => i.kind === "benefit")
    .map(i => ({ i, pv: model.perItem[i.id].cashPV }))
    .sort((a, b) => b.pv - a.pv),
    [items, model]);
  const costsRanked = React.useMemo(() => items
    .filter(i => i.kind === "cost")
    .map(i => ({ i, pv: model.perItem[i.id].cashPV }))
    .sort((a, b) => b.pv - a.pv),
    [items, model]);
  const topBenefit = benefitsRanked[0];
  // Compute full sensitivity list (every assumption × low/high), then
  // partition by control: commitments are sensitivities we own; world
  // facts are sensitivities the audience confirms. Each category ranks
  // independently and totals to 100% within that category — so the reader
  // sees "of what we're claiming, this one matters most" vs "of what
  // you're confirming, this one matters most."
  //
  // Restricted to scope-1 outcomes + all costs: the attribution answers
  // "which inputs matter for the load-bearing case." Scope-2 and scope-3
  // benefits are bonus upside and excluded from this calculation by
  // design — otherwise the weighting gets diluted by speculative impact.
  const sensitivitiesByCategory = React.useMemo(() => {
    const scope1Items = items.filter(it =>
      it.kind === "cost" || (it.kind === "benefit" && (it.scope == null || it.scope === 1))
    );
    const all = computeSensitivity(scope1Items, A, assumptions);
    const idToAssumption = new Map(assumptions.map(a => [a.id, a]));
    const tagged = all
      // Exclude assumptions that don't drive any scope-1 outcome. They
      // produce a zero (or near-zero) swing because nothing in the
      // load-bearing case uses them — keeping them in would suggest a
      // false weight on the "what to question first" page.
      .filter(s => Math.abs(s.range) > 1)
      .map(s => ({
        ...s,
        controllable: !!idToAssumption.get(s.id)?.controllable,
        unit: idToAssumption.get(s.id)?.unit,
        baseValue: idToAssumption.get(s.id)?.value,
      }));
    const commit = tagged.filter(s => s.controllable);
    const world  = tagged.filter(s => !s.controllable);
    const sumRange = (arr) => arr.reduce((acc, s) => acc + (s.range || 0), 0);
    const commitSum = sumRange(commit);
    const worldSum  = sumRange(world);
    const totalSum  = commitSum + worldSum;
    const attribute = (arr, sum) => arr.map(s => ({
      ...s, share: sum > 0 ? s.range / sum : 0,
    }));
    return {
      commit: attribute(commit, commitSum),
      world:  attribute(world,  worldSum),
    };
  }, [items, A, assumptions]);
  const npvPositive = model.npv >= 0;
  const bcrOk       = model.bcr >= 1;
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  // Net cashflow series for the year-by-year view.
  const netSeries = React.useMemo(() => {
    const series = model.yearTotals.benefit.map((b, y) => b - model.yearTotals.cost[y]);
    const cum = series.reduce((acc, v, i) => {
      acc.push((acc[i - 1] || 0) + v);
      return acc;
    }, []);
    return { yearly: series, cumulative: cum };
  }, [model]);

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
  // PAGE 1 — Cover + Numbers at a glance
  // ====================================================================
  const PageCover = (
    <section className="print-page" style={{
      fontFamily: P.sans, color: P.ink,
      display: "flex", flexDirection: "column", minHeight: "250mm",
    }}>
      <PageHeader project={project} section="Summary" />

      <h1 style={{
        fontFamily: P.serif, fontWeight: 500, fontSize: 28, lineHeight: 1.15,
        letterSpacing: "-0.015em", margin: "10mm 0 4mm",
      }}>{project.name}</h1>

      <p style={{
        fontFamily: P.serif, fontStyle: "italic", color: P.ink2,
        fontSize: 13.5, lineHeight: 1.5, margin: "0 0 8mm", maxWidth: "170mm",
      }}>
        Modelled across {horizon} years.
        Over that period the project's value to the business is <strong style={{ color: npvPositive ? P.green : P.red, fontStyle: "normal" }}>{pdMoney(model.npv)}</strong>{" "}
        — every $1 spent comes back as <strong style={{ fontStyle: "normal" }}>${model.bcr.toFixed(2)}</strong>.
        These are estimates from explicit assumptions; mark up anything that looks wrong.
      </p>

      {/* Three core numbers with plain-English headlines and a one-line
          formal description under each. No prescriptive verdict — the
          reader decides whether this is worth advancing. */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
        gap: 8, marginBottom: "8mm",
      }}>
        <StatBox
          label="Net value created"
          hint={`Over ${horizon} years (net present value)`}
          value={pdMoney(model.npv)}
          color={npvPositive ? P.green : P.red}
        />
        <StatBox
          label="Return per $1 spent"
          hint="Benefit-cost ratio"
          value={`${model.bcr.toFixed(2)}×`}
          color={bcrOk ? P.green : P.red}
        />
        <StatBox
          label="Annual rate of return"
          hint="Internal rate of return"
          value={irrValue == null ? "—" : fmtPct(irrValue)}
          color={P.ink}
        />
      </div>

      <PrintEyebrow>The decision being weighed</PrintEyebrow>
      <p style={{
        margin: "6pt 0 0", fontSize: 10.5, lineHeight: 1.55, color: P.ink2,
      }}>{(project.description || "—").trim()}</p>

      <div style={{
        marginTop: "8mm", padding: "8pt 10pt",
        border: `1px solid ${P.lineStrong}`, borderRadius: 6,
        background: P.surfaceSoft,
      }}>
        <div style={{
          marginTop: 6, fontFamily: P.mono, fontSize: 9, color: P.muted,
        }}>
          {horizon} years modelled · {A.discount_rate > 0 ? `${A.discount_rate}% yearly discount` : "no time discounting"} · generated {today}
        </div>
      </div>

      <div style={{
        marginTop: "auto", paddingTop: "8mm",
        fontSize: 9, color: P.muted2, fontStyle: "italic", lineHeight: 1.5,
      }}>
        Decision support, not a forecast. The interactive version at models.teleios.au
        lets you change every assumption and watch the result move.
      </div>
    </section>
  );

  // ====================================================================
  // PAGE 2 — Costs and benefits side by side
  // ====================================================================
  const PageWeighed = (
    <section className="print-page" style={{ fontFamily: P.sans, color: P.ink }}>
      <PageHeader project={project} section="Costs and benefits" />
      <SectionHeader title="What's being weighed" sub={`What this project spends versus what it brings back, totalled across ${horizon} years. Each side ranked by contribution.`} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10mm", marginTop: "6mm" }}>
        <ItemColumn title="Costs" total={model.totalCostsPV} accent={P.red} list={costsRanked} model={model} />
        <ItemColumn title="Benefits" total={model.totalBenefitsPV} accent={P.green} list={benefitsRanked} model={model} />
      </div>

      {topBenefit && (
        <div className="print-avoid-break" style={{
          marginTop: "8mm", padding: "8pt 12pt",
          border: `1px solid ${P.lineStrong}`, borderRadius: 6,
          background: P.surfaceSoft,
        }}>
          <PrintEyebrow>Largest contributor</PrintEyebrow>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 4, gap: 12 }}>
            <span style={{ fontFamily: P.serif, fontSize: 16, fontWeight: 500 }}>{topBenefit.i.name}</span>
            <span style={{ fontFamily: P.mono, fontSize: 12, color: P.green }}>{pdMoney(topBenefit.pv)}</span>
          </div>
          <div style={{ fontSize: 9.5, color: P.muted, marginTop: 4, lineHeight: 1.5 }}>{topBenefit.i.desc || ""}</div>
        </div>
      )}
    </section>
  );

  // ====================================================================
  // PAGE 3 — Year-by-year cashflow
  // ====================================================================
  const PageCashflow = (
    <section className="print-page" style={{ fontFamily: P.sans, color: P.ink }}>
      <PageHeader project={project} section="Year-by-year" />
      <SectionHeader title="When the value lands" sub="Each year's value in and out, plus the running total. Setup costs hit upfront so the first year is usually negative; benefits compound across later years." />

      <div style={{ marginTop: "6mm" }}>
        <CashflowChart yearly={netSeries.yearly} cumulative={netSeries.cumulative} />
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "6mm" }}>
        <thead><tr>
          <th style={cellTh}>Year</th>
          {netSeries.yearly.map((_, y) => (
            <th key={y} style={{ ...cellTh, textAlign: "right" }}>Y{y + 1}</th>
          ))}
          <th style={{ ...cellTh, textAlign: "right" }}>Total</th>
        </tr></thead>
        <tbody>
          <tr>
            <td style={{ ...cellTd, color: P.muted, fontSize: 9.5 }}>Benefits</td>
            {model.yearTotals.benefit.map((v, y) => (
              <td key={y} style={cellTdMono}>{pdMoney(v)}</td>
            ))}
            <td style={cellTdMono}>{pdMoney(model.yearTotals.benefit.reduce((a, b) => a + b, 0))}</td>
          </tr>
          <tr>
            <td style={{ ...cellTd, color: P.muted, fontSize: 9.5 }}>Costs</td>
            {model.yearTotals.cost.map((v, y) => (
              <td key={y} style={{ ...cellTdMono, color: P.red }}>{v > 0 ? "−" : ""}{pdMoney(v)}</td>
            ))}
            <td style={{ ...cellTdMono, color: P.red }}>−{pdMoney(model.yearTotals.cost.reduce((a, b) => a + b, 0))}</td>
          </tr>
          <tr>
            <td style={{ ...cellTd, fontWeight: 500 }}>Net</td>
            {netSeries.yearly.map((v, y) => (
              <td key={y} style={{ ...cellTdMono, fontWeight: 500, color: v >= 0 ? P.green : P.red }}>
                {v >= 0 ? "" : "−"}{pdMoney(Math.abs(v))}
              </td>
            ))}
            <td style={{ ...cellTdMono, fontWeight: 500, color: netSeries.yearly.reduce((a, b) => a + b, 0) >= 0 ? P.green : P.red }}>
              {netSeries.yearly.reduce((a, b) => a + b, 0) >= 0 ? "" : "−"}{pdMoney(Math.abs(netSeries.yearly.reduce((a, b) => a + b, 0)))}
            </td>
          </tr>
          <tr>
            <td style={{ ...cellTd, color: P.muted, fontSize: 9.5 }}>Cumulative</td>
            {netSeries.cumulative.map((v, y) => (
              <td key={y} style={{ ...cellTdMono, color: P.muted }}>
                {v >= 0 ? "" : "−"}{pdMoney(Math.abs(v))}
              </td>
            ))}
            <td style={{ ...cellTdMono, color: P.muted }} />
          </tr>
        </tbody>
      </table>
    </section>
  );

  // ====================================================================
  // PAGE 4 — Assumptions & sources
  //
  // Split into two sub-tables that read as a rhetorical contract:
  //   • Our commitments to you — what the implementer is putting on the
  //     line. The audience can hold us to these.
  //   • What we've assumed about your business — facts the audience
  //     brings to the table. Please confirm.
  // ====================================================================
  const commitments = assumptions.filter(a => a.controllable);
  const worldFacts  = assumptions.filter(a => !a.controllable);

  const renderAssumptionTable = (rows, commitment) => (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "5mm" }}>
      <thead><tr>
        <th style={cellTh}>{commitment ? "Outcome we'll deliver" : "What we've assumed"}</th>
        <th style={{ ...cellTh, textAlign: "right" }}>Value</th>
        <th style={cellTh}>Source</th>
        <th style={cellTh}>Rationale</th>
      </tr></thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.id} className="print-avoid-break">
            <td style={{
              ...cellTd, width: "30%",
              ...(commitment ? {
                background: `color-mix(in srgb, ${P.green} 8%, transparent)`,
                borderLeft: `1px solid color-mix(in srgb, ${P.green} 40%, transparent)`,
                paddingLeft: "9pt",
              } : {}),
            }}>
              <div style={{ fontWeight: 500 }}>{a.label}</div>
              <div style={{ fontSize: 8.5, color: P.muted2, fontFamily: P.mono, marginTop: 1 }}>{a.id}</div>
            </td>
            <td style={{ ...cellTdMono, width: "12%", whiteSpace: "nowrap" }}>
              {typeof a.value === "number" ? a.value.toLocaleString() : a.value}
              {a.unit && <span style={{ color: P.muted2, marginLeft: 4 }}>{a.unit}</span>}
            </td>
            <td style={{ ...cellTd, width: "18%", fontSize: 9, color: P.muted }}>{a.source || "—"}</td>
            <td style={{ ...cellTd, fontSize: 9, color: P.ink2, lineHeight: 1.5 }}>{a.description || ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const PageAssumptions = (
    <section className="print-page" style={{ fontFamily: P.sans, color: P.ink }}>
      <PageHeader project={project} section="Assumptions" />
      <SectionHeader title="What we're assuming" sub="Two kinds of inputs drive this model. The first set we're committing to deliver against; the second we've taken from what we believe about your business and would like you to confirm." />

      {commitments.length > 0 && (
        <div style={{ marginTop: "8mm" }}>
          <div style={{
            fontFamily: P.serif, fontSize: 15, fontWeight: 500,
            color: P.ink, letterSpacing: "-0.005em",
          }}>
            Our commitments to you
          </div>
          <div style={{
            fontSize: 10, color: P.muted, lineHeight: 1.5, marginTop: 3,
          }}>
            What we're putting on the line — outcomes within our control as implementer. These are the numbers a performance-based engagement could be priced against.
          </div>
          {renderAssumptionTable(commitments, true)}
        </div>
      )}

      {worldFacts.length > 0 && (
        <div style={{ marginTop: "10mm" }}>
          <div style={{
            fontFamily: P.serif, fontSize: 15, fontWeight: 500,
            color: P.ink, letterSpacing: "-0.005em",
          }}>
            What we've assumed about your business — please confirm
          </div>
          <div style={{
            fontSize: 10, color: P.muted, lineHeight: 1.5, marginTop: 3,
          }}>
            Facts about your current state that we've taken as given. You know these better than we do — push back on anything that doesn't match your reality.
          </div>
          {renderAssumptionTable(worldFacts, false)}
        </div>
      )}
    </section>
  );

  // ====================================================================
  // PAGE 5 — What to question first
  //
  // Each category (commitments, world facts) gets its own ranked list.
  // The "share" column shows each input's contribution to its category's
  // total swing in the project's value — so a reader can see "of what
  // we're claiming, this one is XX% of the variance" at a glance.
  //
  // The top-line cross-category split frames the conversation: how much
  // of the outcome rides on our delivery vs the buyer's world being as
  // we assumed it.
  // ====================================================================
  const TOP_PER_CATEGORY = 4;
  const allRanges = [
    ...sensitivitiesByCategory.commit.map(s => s.range),
    ...sensitivitiesByCategory.world.map(s => s.range),
  ];
  const sensMaxAll = Math.max(...allRanges, 1);

  const renderSensitivityList = (rows, accent) => (
    <ol style={{
      listStyle: "decimal", paddingLeft: "5mm", margin: "4mm 0 0",
      fontFamily: P.sans,
    }}>
      {rows.map(s => {
        const lo = s.lo, hi = s.hi;
        const downPct = ((s.base - lo) / sensMaxAll) * 45;
        const upPct   = ((hi - s.base) / sensMaxAll) * 45;
        return (
          <li key={s.id} className="print-avoid-break" style={{
            marginBottom: "5mm",
            paddingLeft: 4,
            ...(accent ? { listStylePosition: "outside" } : {}),
          }}>
            <div style={{
              display: "flex", alignItems: "baseline", justifyContent: "space-between",
              gap: 12, marginBottom: 3,
            }}>
              <div style={{
                fontSize: 11.5, fontWeight: 500, color: P.ink,
                fontFamily: P.serif, letterSpacing: "-0.005em", lineHeight: 1.3,
                flex: "1 1 auto", minWidth: 0,
              }}>
                {s.label}
                {typeof s.baseValue === "number" && (
                  <span style={{
                    fontFamily: P.mono, fontSize: 9.5, color: P.muted2,
                    marginLeft: 6, fontWeight: 400,
                  }}>
                    {s.baseValue.toLocaleString()}{s.unit ? ` ${s.unit}` : ""}
                  </span>
                )}
              </div>
              <div style={{
                flexShrink: 0,
                fontFamily: P.mono, fontSize: 10, fontWeight: 600,
                color: accent || P.ink2,
              }}>
                {Math.round(s.share * 100)}%
              </div>
            </div>
            <div style={{
              fontSize: 9, color: P.muted, lineHeight: 1.5, marginBottom: 4,
            }}>
              −{Math.round((1 - s.loMul) * 100)}% → <span style={{ color: P.red }}>{pdMoney(lo)}</span>
              {" · "}
              +{Math.round((s.hiMul - 1) * 100)}% → <span style={{ color: P.green }}>{pdMoney(hi)}</span>
            </div>
            <div style={{ position: "relative", height: 6, background: P.surfaceSoft, borderRadius: 2 }}>
              <div style={{ position: "absolute", top: 0, bottom: 0, left: `${50 - downPct}%`, width: `${downPct}%`, background: P.red, opacity: 0.6, borderRadius: "2px 0 0 2px" }} />
              <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: `${upPct}%`, background: P.green, opacity: 0.6, borderRadius: "0 2px 2px 0" }} />
              <div style={{ position: "absolute", top: -1, bottom: -1, left: "50%", width: 1, background: P.ink }} />
            </div>
          </li>
        );
      })}
    </ol>
  );

  const commitTopN = sensitivitiesByCategory.commit.slice(0, TOP_PER_CATEGORY);
  const worldTopN  = sensitivitiesByCategory.world.slice(0, TOP_PER_CATEGORY);
  const commitMore = Math.max(0, sensitivitiesByCategory.commit.length - TOP_PER_CATEGORY);
  const worldMore  = Math.max(0, sensitivitiesByCategory.world.length  - TOP_PER_CATEGORY);

  const PageSensitivity = (
    <section className="print-page" style={{ fontFamily: P.sans, color: P.ink }}>
      <PageHeader project={project} section="What to question first" />
      <SectionHeader title="What to question first" sub="Within each side of the table, these are the inputs that carry the most weight. Share is each input's contribution to that category's total variance — bigger share means more rides on getting that one right." />

      {/* Commitments section */}
      {commitTopN.length > 0 && (
        <div style={{ marginTop: "8mm" }}>
          <div style={{
            fontFamily: P.serif, fontSize: 14, fontWeight: 500,
            color: P.ink, letterSpacing: "-0.005em",
            paddingBottom: 4, borderBottom: `1px solid ${P.line}`,
          }}>
            Outcomes we'll deliver — ranked by weight
          </div>
          {renderSensitivityList(commitTopN, P.green)}
          {commitMore > 0 && (
            <div style={{ marginTop: 2, fontSize: 9, color: P.muted2, fontStyle: "italic" }}>
              + {commitMore} other commitment{commitMore > 1 ? "s" : ""} with smaller individual weight (see Assumptions page).
            </div>
          )}
        </div>
      )}

      {/* World facts section */}
      {worldTopN.length > 0 && (
        <div style={{ marginTop: "6mm" }}>
          <div style={{
            fontFamily: P.serif, fontSize: 14, fontWeight: 500,
            color: P.ink, letterSpacing: "-0.005em",
            paddingBottom: 4, borderBottom: `1px solid ${P.line}`,
          }}>
            Facts about your business — ranked by weight
          </div>
          {renderSensitivityList(worldTopN, P.ink2)}
          {worldMore > 0 && (
            <div style={{ marginTop: 2, fontSize: 9, color: P.muted2, fontStyle: "italic" }}>
              + {worldMore} other fact{worldMore > 1 ? "s" : ""} with smaller individual weight (see Assumptions page).
            </div>
          )}
        </div>
      )}
    </section>
  );

  return (
    <div className="print-only">
      {PageCover}
      {PageWeighed}
      {PageCashflow}
      {PageAssumptions}
      {PageSensitivity}
    </div>
  );
};

// -- shared bits for the report -----------------------------------------
const StatBox = ({ label, hint, value, color, small }) => (
  <div style={{
    border: `1px solid ${P.line}`, borderRadius: 6, padding: "10pt 10pt",
    background: P.surface, breakInside: "avoid",
  }}>
    <div style={{
      fontFamily: P.sans, fontSize: 10, fontWeight: 600,
      color: P.ink2, lineHeight: 1.2,
    }}>{label}</div>
    {hint && (
      <div style={{
        fontFamily: P.sans, fontSize: 8.5, color: P.muted2,
        marginTop: 2, lineHeight: 1.3, fontStyle: "italic",
      }}>{hint}</div>
    )}
    <div style={{
      fontFamily: P.serif, fontWeight: 500, fontSize: small ? 13 : 22,
      color: color || P.ink, marginTop: 8, lineHeight: 1.1, letterSpacing: "-0.01em",
    }}>{value}</div>
  </div>
);

const SectionHeader = ({ eyebrow, title, sub }) => (
  <div style={{ paddingBottom: 6, borderBottom: `1px solid ${P.line}`, marginTop: "2mm" }}>
    {eyebrow && <PrintEyebrow>{eyebrow}</PrintEyebrow>}
    <h2 style={{
      fontFamily: P.serif, fontWeight: 500, fontSize: 22, lineHeight: 1.2,
      letterSpacing: "-0.012em", margin: eyebrow ? "6pt 0 0" : 0,
    }}>{title}</h2>
    {sub && <p style={{ margin: "6pt 0 0", color: P.muted, fontSize: 10, lineHeight: 1.5 }}>{sub}</p>}
  </div>
);

// Per-page header — project name on the left, section name on the right.
// Repeated on every page so handouts shuffled out of order stay legible.
const PageHeader = ({ project, section }) => (
  <div style={{
    display: "flex", justifyContent: "space-between", alignItems: "baseline",
    paddingBottom: 6, borderBottom: `1px solid ${P.line}`,
    fontFamily: P.sans, fontSize: 9, color: P.muted,
  }}>
    <span style={{
      fontWeight: 500, letterSpacing: "-0.005em", color: P.ink2,
      maxWidth: "120mm", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    }}>
      {project.shortName || project.name}
    </span>
    <span style={{
      letterSpacing: "0.1em", textTransform: "uppercase", fontSize: 8.5,
      color: P.muted2,
    }}>
      {section}
    </span>
  </div>
);

// Tiny SVG cashflow chart for the print report. Net per year as bars
// (green positive / red negative) and cumulative as a thin overlay line.
const CashflowChart = ({ yearly, cumulative }) => {
  const W = 720, H = 220, padL = 50, padR = 24, padT = 18, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const N = yearly.length;
  if (N === 0) return null;
  const allValues = [...yearly, ...cumulative, 0];
  const maxY = Math.max(...allValues), minY = Math.min(...allValues);
  const span = Math.max(maxY - minY, 1);
  // Zero line at this y inside the chart.
  const yFor = (v) => padT + ((maxY - v) / span) * innerH;
  const slot = innerW / N;
  const barW = slot * 0.55;
  const formatTick = (v) => fmtMoney(v / 1000, { exact: true });
  const ticks = 4;
  const tickValues = Array.from({ length: ticks + 1 }, (_, i) => maxY - (span * i) / ticks);

  // Build the cumulative path string.
  const cumPoints = cumulative.map((v, i) => {
    const cx = padL + slot * i + slot / 2;
    return `${i === 0 ? "M" : "L"}${cx.toFixed(1)},${yFor(v).toFixed(1)}`;
  }).join(" ");

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
         style={{ display: "block" }}>
      {/* Gridlines + y-axis labels */}
      {tickValues.map((v, i) => {
        const y = yFor(v);
        const isZero = Math.abs(v) < 1e-6;
        return (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y} y2={y}
                  stroke={isZero ? P.lineStrong : P.line}
                  strokeWidth={isZero ? 1 : 0.6}
                  strokeDasharray={isZero ? undefined : "2 3"} />
            <text x={padL - 6} y={y + 3.5} fontSize="8.5"
                  fill={P.muted2} fontFamily={P.sans} textAnchor="end">
              {formatTick(v)}
            </text>
          </g>
        );
      })}
      {/* Bars: per-year net */}
      {yearly.map((v, i) => {
        const cx = padL + slot * i + slot / 2;
        const top = yFor(Math.max(v, 0));
        const bottom = yFor(Math.min(v, 0));
        return (
          <g key={i}>
            <rect x={cx - barW / 2} y={top} width={barW} height={Math.max(bottom - top, 1)}
                  fill={v >= 0 ? P.green : P.red} opacity="0.65" />
            <text x={cx} y={H - 10} fontSize="9" fill={P.muted}
                  fontFamily={P.sans} textAnchor="middle">Y{i + 1}</text>
          </g>
        );
      })}
      {/* Cumulative line */}
      <path d={cumPoints} stroke={P.ink} strokeWidth="1.4" fill="none" />
      {cumulative.map((v, i) => {
        const cx = padL + slot * i + slot / 2;
        return <circle key={i} cx={cx} cy={yFor(v)} r="2.5" fill={P.ink} />;
      })}
      {/* Small legend */}
      <g transform={`translate(${padL}, 8)`}>
        <rect x="0" y="-7" width="10" height="8" fill={P.green} opacity="0.65" />
        <text x="14" y="0" fontSize="8.5" fill={P.muted} fontFamily={P.sans}>Net per year</text>
        <line x1="92" y1="-3" x2="108" y2="-3" stroke={P.ink} strokeWidth="1.4" />
        <circle cx="100" cy="-3" r="2.5" fill={P.ink} />
        <text x="112" y="0" fontSize="8.5" fill={P.muted} fontFamily={P.sans}>Cumulative</text>
      </g>
    </svg>
  );
};


const ItemColumn = ({ title, total, accent, list, model }) => (
  <div>
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
      <PrintEyebrow>{title}</PrintEyebrow>
      <span style={{ fontFamily: P.mono, fontSize: 10, color: accent }}>
        {pdMoney(total)}
      </span>
    </div>
    {list.map(({ i, pv }) => (
      <div key={i.id} className="print-avoid-break" style={{
        padding: "6pt 0", borderBottom: `1px solid ${P.line}`,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontFamily: P.serif, fontSize: 12, fontWeight: 500 }}>{i.name}</span>
          <span style={{ fontFamily: P.mono, fontSize: 10, color: P.ink2 }}>{pdMoney(pv)}</span>
        </div>
        <div style={{ fontSize: 9, color: P.muted, marginTop: 3, lineHeight: 1.5 }}>{i.desc || ""}</div>
      </div>
    ))}
  </div>
);

Object.assign(window, { exportAll, exportCashflow, exportAssumptions, downloadCSV, printPDF, PrintReport });

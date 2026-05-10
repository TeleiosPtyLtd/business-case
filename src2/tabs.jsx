// Tab panels — Edit Model, Timeline, Data Tables, Summary

// ---------- EDIT MODEL ----------
const EditModelPanel = ({ items, model, A, onAddItem, onRemoveItem, includeSoft, readOnly }) => {
  const [openItem, setOpenItem] = React.useState(null);
  const costs = items.filter(i => i.kind === "cost");
  const benefits = items.filter(i => i.kind === "benefit");

  const yearTotals = model.yearTotals;
  const maxYear = Math.max(...yearTotals.cost, ...yearTotals.benefit, 1) * 1.05;

  const seriesFor = (kind) => items.filter(i => i.kind === kind).map(i => {
    const s = model.perItem[i.id];
    const yearly = i.kind === "benefit"
      ? s.cash.map((c, idx) => c + (includeSoft ? s.soft[idx] : 0))
      : s.cash;
    return { key: i.id, color: i.color, name: i.name, values: yearly };
  });

  return (
    <div className="panel-fade" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "flex-start" }}>
      <ChartGroup title="Costs" kind="cost" series={seriesFor("cost")} yMax={maxYear} subtitle={`${HORIZON}-year horizon`}>
        {costs.map(i => (
          <ItemRow key={i.id} item={i} A={A} series={model.perItem[i.id]}
            includeSoft={includeSoft}
            expanded={openItem === i.id}
            onClick={() => setOpenItem(openItem === i.id ? null : i.id)}
            onRemove={!readOnly && i.removable ? () => onRemoveItem(i.id) : null} />
        ))}
        {!readOnly && <AddButton label="Add cost" onClick={() => onAddItem("cost")} />}
      </ChartGroup>
      <ChartGroup title="Benefits" kind="benefit" series={seriesFor("benefit")} yMax={maxYear} subtitle={includeSoft ? "cash + soft" : "cash only"}>
        {benefits.map(i => (
          <ItemRow key={i.id} item={i} A={A} series={model.perItem[i.id]}
            includeSoft={includeSoft}
            expanded={openItem === i.id}
            onClick={() => setOpenItem(openItem === i.id ? null : i.id)}
            onRemove={!readOnly && i.removable ? () => onRemoveItem(i.id) : null} />
        ))}
        {!readOnly && <AddButton label="Add benefit" onClick={() => onAddItem("benefit")} />}
      </ChartGroup>
    </div>
  );
};

const ChartGroup = ({ title, kind, series, yMax, subtitle, children }) => (
  <Card2 padding={20} style={{ borderRadius: 20 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
      <Eyebrow2>{title}</Eyebrow2>
      <span style={{ fontSize: 11, color: "var(--muted-2)", fontFamily: "var(--mono)" }}>{subtitle}</span>
    </div>
    <div style={{ marginLeft: -8, marginRight: -4 }}>
      <HoverStackedBars series={series} height={220} yMax={yMax}
        yLabelFmt={v => v >= 1000 ? `$${(v/1000).toFixed(1)}M` : `$${v.toFixed(0)}k`} />
    </div>
    <ColumnHeaders kind={kind} />
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
      {children}
    </div>
  </Card2>
);

const ColumnHeaders = ({ kind }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 10,
    padding: "14px 14px 8px",
    fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
    color: "var(--eyebrow)", fontWeight: 500,
    borderBottom: "1px solid var(--line)", marginBottom: 4,
  }}>
    <span style={{ width: 8 }} />
    <span style={{ flex: 1 }}>{kind === "cost" ? "Cost" : "Benefit"}</span>
    {kind === "benefit" && <span style={{ width: 36, textAlign: "center" }}>Conf.</span>}
    <span style={{ width: 56, textAlign: "right" }}>PV</span>
    <span style={{ width: 14 }} />
  </div>
);

const AddButton = ({ label, onClick }) => (
  <button onClick={onClick} style={{
    border: "1px dashed var(--line-strong)", background: "transparent",
    padding: "10px 14px", borderRadius: 10,
    color: "var(--muted)", fontSize: 13, cursor: "pointer",
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  }}><IconPlus size={14} /> {label}</button>
);

// ---------- TIMELINE ----------
const TimelinePanel = ({ items, model, A, includeSoft }) => {
  const ranges = items.map(i => {
    const s = model.perItem[i.id];
    const vals = i.kind === "benefit" ? s.cash.map((c, y) => c + (includeSoft ? s.soft[y] : 0)) : s.cash;
    let start = -1, end = -1;
    for (let y = 0; y < HORIZON; y++) {
      if (vals[y] > 0) { if (start < 0) start = y; end = y; }
    }
    const total = vals.reduce((a, b) => a + b, 0);
    return { item: i, start, end, total, vals, conf: itemConfidence(i, A) };
  }).filter(r => r.start >= 0)
    .sort((a, b) => (a.item.kind === b.item.kind ? a.start - b.start : (a.item.kind === "cost" ? -1 : 1)));

  const max = Math.max(...ranges.flatMap(r => r.vals), 1);

  return (
    <Card2 className="panel-fade" padding={28} style={{ borderRadius: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <Eyebrow2>Timeline</Eyebrow2>
          <div style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 500, marginTop: 6 }}>
            When each impact lands
          </div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          <Legend color="var(--c-red)"   label="Cost" />
          <Legend color="var(--c-mint)"  label="Benefit" />
        </div>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: `260px repeat(${HORIZON}, 1fr)`,
        gap: 0, paddingBottom: 8, borderBottom: "1px solid var(--line)", marginBottom: 8,
      }}>
        <div />
        {Array.from({ length: HORIZON }).map((_, y) => (
          <div key={y} style={{ fontSize: 11, color: "var(--muted-2)", fontFamily: "var(--mono)", textAlign: "center" }}>Y{y + 1}</div>
        ))}
      </div>

      {ranges.map(r => (
        <div key={r.item.id} style={{
          display: "grid", gridTemplateColumns: `260px repeat(${HORIZON}, 1fr)`,
          gap: 0, alignItems: "center", padding: "6px 0",
          borderBottom: "1px dashed var(--line)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 12, minWidth: 0 }}>
            <Dot2 color={r.item.color} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {r.item.name}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--muted-2)", fontFamily: "var(--mono)" }}>
                Y{r.start + 1}–Y{r.end + 1} · {fmtMoney(r.total)}
              </div>
            </div>
            {r.item.kind === "benefit" && <ConfidenceChip confidence={r.conf} hideLabel />}
          </div>
          {r.vals.map((v, y) => {
            const intensity = v / max;
            return (
              <div key={y} style={{ padding: "0 2px" }}>
                <div style={{
                  height: 22, borderRadius: 5,
                  background: v > 0
                    ? `color-mix(in srgb, ${r.item.color} ${20 + intensity * 70}%, transparent)`
                    : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontFamily: "var(--mono)",
                  color: intensity > 0.5 ? "var(--ink)" : "var(--muted)",
                  border: v > 0 ? `1px solid color-mix(in srgb, ${r.item.color} 50%, transparent)` : "1px solid transparent",
                }}>{v > 0 ? fmtMoney(v) : ""}</div>
              </div>
            );
          })}
        </div>
      ))}
    </Card2>
  );
};

const Legend = ({ color, label }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
    <Dot2 color={color} /> {label}
  </span>
);

// ---------- DATA TABLES ----------
const DataTablesPanel = ({ items, model, assumptions, includeSoft }) => {
  const seriesFor = (i) => {
    const s = model.perItem[i.id];
    return i.kind === "benefit" ? s.cash.map((c, y) => c + (includeSoft ? s.soft[y] : 0)) : s.cash;
  };
  return (
    <div className="panel-fade" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card2 padding={0} style={{ borderRadius: 20, overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)",
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <Eyebrow2>Cash flows</Eyebrow2>
            <div style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 500, marginTop: 6 }}>
              Annual values by item ({includeSoft ? "cash + soft" : "cash only"})
            </div>
          </div>
          <ExportButton onClick={() => exportCashflow(items, model, includeSoft)} label="Cash flows" />
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ background: "var(--surface-2)" }}>
                <Th left>Item</Th>
                {Array.from({ length: HORIZON }).map((_, y) => <Th key={y}>Y{y + 1}</Th>)}
                <Th>Total</Th>
              </tr>
            </thead>
            <tbody>
              <SectionRow label="Costs" />
              {items.filter(i => i.kind === "cost").map(i => (
                <ItemDataRow key={i.id} item={i} values={seriesFor(i)} sign={-1} />
              ))}
              <TotalRow label="Total costs" values={model.yearTotals.cost} sign={-1} />
              <SectionRow label="Benefits" />
              {items.filter(i => i.kind === "benefit").map(i => (
                <ItemDataRow key={i.id} item={i} values={seriesFor(i)} sign={+1} />
              ))}
              <TotalRow label="Total benefits" values={model.yearTotals.benefit} sign={+1} />
              <NetRow yearTotals={model.yearTotals} />
            </tbody>
          </table>
        </div>
      </Card2>

      <Card2 padding={0} style={{ borderRadius: 20, overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)",
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <Eyebrow2>Item waterfall</Eyebrow2>
            <div style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 500, marginTop: 6 }}>
              PV adjustments per item
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 4 }}>
              Gross → after overlap → after phase risk → incremental net → cash + soft split.
            </div>
          </div>
          <ExportButton onClick={() => exportItemWaterfall(items, model)} label="Waterfall" />
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ background: "var(--surface-2)" }}>
                <Th left>Item</Th>
                <Th>Gross PV</Th>
                <Th>After overlap</Th>
                <Th>After phase</Th>
                <Th>Net PV</Th>
                <Th>Cash PV</Th>
                <Th>Soft PV</Th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => {
                const s = model.perItem[i.id];
                return (
                  <tr key={i.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <Td left>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <Dot2 color={i.color} /> {i.name}
                      </span>
                    </Td>
                    <Td mono>{fmtMoney(s.grossPV, { precise: true })}</Td>
                    <Td mono color={s.grossPV !== s.overlapPV ? "var(--muted)" : undefined}>
                      {fmtMoney(s.overlapPV, { precise: true })}
                    </Td>
                    <Td mono color="var(--muted)">{fmtMoney(s.phasePV, { precise: true })}</Td>
                    <Td mono><strong>{fmtMoney(s.netPV, { precise: true })}</strong></Td>
                    <Td mono color="var(--green-deep)">{fmtMoney(s.cashPV, { precise: true })}</Td>
                    <Td mono color="var(--muted)">{fmtMoney(s.softPV, { precise: true })}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card2>

      <Card2 padding={0} style={{ borderRadius: 20, overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)",
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <Eyebrow2>Assumptions</Eyebrow2>
            <div style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 500, marginTop: 6 }}>
              All input parameters
            </div>
          </div>
          <ExportButton onClick={() => exportAssumptions(assumptions)} label="Assumptions" />
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead>
              <tr style={{ background: "var(--surface-2)" }}>
                <Th left>Parameter</Th>
                <Th>Value</Th>
                <Th left>Group</Th>
                <Th left>Source</Th>
              </tr>
            </thead>
            <tbody>
              {assumptions.map(a => (
                <tr key={a.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <Td left>
                    <div style={{ fontWeight: 500 }}>{a.label}{a.modified && <span style={{ color: "var(--muted-2)", fontSize: 11, marginLeft: 6 }}>· edited</span>}</div>
                    {a.description && <div style={{ color: "var(--muted)", fontSize: 11.5, marginTop: 2, whiteSpace: "normal" }}>{a.description}</div>}
                  </Td>
                  <Td mono>{a.value.toLocaleString()} {a.unit && <span style={{ color: "var(--muted-2)" }}>{a.unit}</span>}</Td>
                  <Td left color="var(--muted)">{a.group}</Td>
                  <Td left color="var(--muted)">{a.source}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card2>
    </div>
  );
};

const ExportButton = ({ onClick, label }) => (
  <button onClick={onClick} style={{
    border: "1px solid var(--line-strong)", background: "var(--surface)",
    color: "var(--ink)", padding: "7px 12px", borderRadius: 8,
    fontSize: 12, fontWeight: 500, cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 6,
    whiteSpace: "nowrap",
  }}><IconDownload size={12} /> Export {label}</button>
);

const Th = ({ children, left }) => (
  <th style={{
    padding: "10px 14px", textAlign: left ? "left" : "right",
    fontSize: 11, fontWeight: 500, color: "var(--muted)",
    textTransform: "uppercase", letterSpacing: "0.08em",
  }}>{children}</th>
);
const Td = ({ children, left, color, mono }) => (
  <td style={{
    padding: "10px 14px", textAlign: left ? "left" : "right",
    fontSize: 13, color: color || "var(--ink)",
    fontFamily: mono ? "var(--mono)" : "var(--sans)",
    whiteSpace: "nowrap",
  }}>{children}</td>
);
const SectionRow = ({ label }) => (
  <tr style={{ background: "var(--bg-soft)" }}>
    <td colSpan={HORIZON + 2} style={{
      padding: "8px 14px", fontSize: 11, fontWeight: 500,
      color: "var(--eyebrow)", textTransform: "uppercase", letterSpacing: "0.12em",
    }}>{label}</td>
  </tr>
);
const ItemDataRow = ({ item, values, sign }) => (
  <tr style={{ borderTop: "1px solid var(--line)" }}>
    <Td left><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Dot2 color={item.color} /> {item.name}</span></Td>
    {values.map((v, y) => (
      <Td key={y} mono color={v < 1 ? "var(--muted-2)" : undefined}>
        {v < 1 ? "—" : (sign < 0 ? `(${fmtMoney(v)})` : fmtMoney(v))}
      </Td>
    ))}
    <Td mono><strong>{sign < 0 ? `(${fmtMoney(values.reduce((a,b)=>a+b,0))})` : fmtMoney(values.reduce((a,b)=>a+b,0))}</strong></Td>
  </tr>
);
const TotalRow = ({ label, values, sign }) => (
  <tr style={{ borderTop: "1px solid var(--line-strong)", background: "var(--surface-2)" }}>
    <Td left><strong>{label}</strong></Td>
    {values.map((v, y) => (
      <Td key={y} mono><strong>{sign < 0 ? `(${fmtMoney(v)})` : fmtMoney(v)}</strong></Td>
    ))}
    <Td mono><strong>{sign < 0 ? `(${fmtMoney(values.reduce((a,b)=>a+b,0))})` : fmtMoney(values.reduce((a,b)=>a+b,0))}</strong></Td>
  </tr>
);
const NetRow = ({ yearTotals }) => {
  const net = yearTotals.benefit.map((b, y) => b - yearTotals.cost[y]);
  const total = net.reduce((a, b) => a + b, 0);
  return (
    <tr style={{ borderTop: "2px solid var(--ink)", background: "var(--surface)" }}>
      <Td left><strong>Net cash flow</strong></Td>
      {net.map((v, y) => (
        <Td key={y} mono color={v >= 0 ? "var(--green-deep)" : "var(--red-deep)"}>
          <strong>{v < 0 ? `(${fmtMoney(-v)})` : fmtMoney(v)}</strong>
        </Td>
      ))}
      <Td mono color={total >= 0 ? "var(--green-deep)" : "var(--red-deep)"}>
        <strong>{total < 0 ? `(${fmtMoney(-total)})` : fmtMoney(total)}</strong>
      </Td>
    </tr>
  );
};

// ---------- SUMMARY ----------
const SummaryPanel = ({ items, model, A, irrValue, project, assumptions, includeSoft, scenario }) => {
  const benefits = items.filter(i => i.kind === "benefit");
  const sortedBenefits = [...benefits].map(i => ({
    i, pv: model.perItem[i.id].cashPV + (includeSoft ? model.perItem[i.id].softPV : 0)
  })).sort((a, b) => b.pv - a.pv);
  const topBenefit = sortedBenefits[0];

  const sensitivities = computeSensitivity(items, A, assumptions, 0.25).slice(0, 5);
  const sensMax = Math.max(...sensitivities.map(s => s.range), 1);

  return (
    <Card2 className="panel-fade" padding={36} style={{ borderRadius: 20 }}>
      <Eyebrow2>Summary</Eyebrow2>
      <h2 style={{
        fontFamily: "var(--serif)", fontWeight: 500, fontSize: 28, letterSpacing: "-0.015em",
        lineHeight: 1.2, margin: "10px 0 6px", maxWidth: 760,
      }}>
        {project.name} delivers a {model.npv >= 0 ? <em style={{ color: "var(--green-deep)", fontStyle: "italic" }}>positive return</em> : <em style={{ color: "var(--red-deep)", fontStyle: "italic" }}>negative return</em>} of <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMoney(model.npv, { precise: true })}</span> over the {HORIZON}-year horizon{" "}
        <span style={{ color: "var(--muted-2)", fontSize: 16, fontStyle: "normal" }}>({scenario})</span>.
      </h2>
      <p style={{ color: "var(--muted)", fontSize: 14, maxWidth: 760, margin: "0 0 24px", lineHeight: 1.6 }}>
        With a Benefit-Cost Ratio of <strong style={{ color: "var(--ink)" }}>{model.bcr.toFixed(2)}</strong>, every dollar invested returns{" "}
        <strong style={{ color: "var(--ink)" }}>${model.bcr.toFixed(2)}</strong> in {includeSoft ? "cash + soft" : "cash"} value
        after waterfall adjustments (overlap, phase delivery risk, and counterfactual capture).
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        <Stat label="Cash benefits PV" value={fmtMoney(model.totalCashBenefitsPV, { precise: true })} accent="var(--green-deep)" />
        <Stat label="Soft benefits PV" value={fmtMoney(model.totalSoftBenefitsPV, { precise: true })} sub={includeSoft ? "included" : "excluded from NPV"} />
        <Stat label="Total costs PV"   value={fmtMoney(model.totalCostsPV, { precise: true })} />
        <Stat label="IRR"               value={irrValue == null ? "—" : fmtPct(irrValue)} sub="annualised" />
      </div>

      {topBenefit?.i && (
        <div style={{
          border: "1px solid var(--line)", borderRadius: 12, padding: 18,
          background: "var(--surface-2)", marginBottom: 24,
        }}>
          <Eyebrow2>Largest contributor</Eyebrow2>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <Dot2 color={topBenefit.i.color} size={10} />
            <div style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 500, flex: 1 }}>{topBenefit.i.name}</div>
            <ConfidenceChip confidence={itemConfidence(topBenefit.i, A)} />
            <div style={{ fontFamily: "var(--mono)", fontSize: 14, color: "var(--muted)" }}>{fmtMoney(topBenefit.pv, { precise: true })}</div>
          </div>
          <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}>{topBenefit.i.desc}</div>
        </div>
      )}

      {/* Sensitivity */}
      <div style={{
        border: "1px solid var(--line)", borderRadius: 12, padding: 20, background: "var(--surface)",
      }}>
        <Eyebrow2>What moves the most</Eyebrow2>
        <div style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0 16px" }}>
          NPV swing when each assumption is varied across its sensitivity range
          (default ±25%; per-assumption ranges respected). Top 5 levers.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sensitivities.map(s => {
            const lowPct = Math.round((1 - s.loMul) * 100);
            const hiPct  = Math.round((s.hiMul - 1) * 100);
            return (
              <div key={s.id} style={{ display: "grid", gridTemplateColumns: "200px 1fr 130px", gap: 12, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{s.label}</div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-2)", fontFamily: "var(--mono)", marginTop: 2 }}>
                    -{lowPct}% / +{hiPct}%
                  </div>
                </div>
                <TornadoBar lo={s.lo} hi={s.hi} base={s.base} max={sensMax} />
                <div style={{ fontFamily: "var(--mono)", fontSize: 11.5, textAlign: "right", color: "var(--muted)" }}>
                  {fmtMoney(s.lo, { precise: true })} → {fmtMoney(s.hi, { precise: true })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card2>
  );
};

const TornadoBar = ({ lo, hi, base, max }) => {
  const center = 50;
  const loPct = ((base - lo) / max) * 50;
  const hiPct = ((hi - base) / max) * 50;
  return (
    <div style={{ position: "relative", height: 14, background: "var(--bg-soft)", borderRadius: 4 }}>
      <div style={{
        position: "absolute", top: 0, bottom: 0, left: `${center - loPct}%`,
        width: `${loPct}%`, background: "color-mix(in srgb, var(--red-deep) 60%, transparent)",
        borderRadius: "4px 0 0 4px",
      }} />
      <div style={{
        position: "absolute", top: 0, bottom: 0, left: `${center}%`,
        width: `${hiPct}%`, background: "color-mix(in srgb, var(--green-deep) 60%, transparent)",
        borderRadius: "0 4px 4px 0",
      }} />
      <div style={{
        position: "absolute", top: -2, bottom: -2, left: `${center}%`,
        width: 1, background: "var(--ink)",
      }} />
    </div>
  );
};

const Stat = ({ label, value, sub, accent }) => (
  <div style={{
    border: "1px solid var(--line)", borderRadius: 12, padding: 16,
    background: "var(--surface-2)",
  }}>
    <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 500 }}>{label}</div>
    <div style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 500, marginTop: 6, lineHeight: 1, color: accent || "var(--ink)" }}>{value}</div>
    {sub && <div style={{ color: "var(--muted-2)", fontSize: 11, marginTop: 6, fontFamily: "var(--mono)" }}>{sub}</div>}
  </div>
);

Object.assign(window, { EditModelPanel, TimelinePanel, DataTablesPanel, SummaryPanel });

// Items panel — cost & benefit list with confidence chip + value-waterfall drill-down

// ---------- Confidence chip ----------
const confidenceBand = (conf) => {
  if (conf >= 0.55) return { label: "Likely",      color: "var(--green-deep)", bg: "var(--green-soft)" };
  if (conf >= 0.25) return { label: "Possible",    color: "var(--c-orange)",   bg: "color-mix(in srgb, var(--c-orange) 12%, transparent)" };
  return                   { label: "Speculative", color: "var(--muted)",      bg: "var(--bg-soft)" };
};

const ConfidenceChip = ({ confidence, hideLabel }) => {
  const b = confidenceBand(confidence);
  const pct = Math.round(confidence * 100);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "2px 8px", borderRadius: 999,
      background: b.bg,
      color: b.color, fontSize: 11, fontWeight: 500,
      fontFamily: "var(--mono)",
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: b.color }} />
      {pct}% {!hideLabel && <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {b.label}</span>}
    </span>
  );
};

// ---------- Item row ----------
const ItemRow = ({ item, series, A, expanded, onClick, onRemove, includeSoft }) => {
  const conf = itemConfidence(item, A);
  const isCost = item.kind === "cost";
  const valuePV = isCost ? series.cashPV : (series.cashPV + (includeSoft ? series.softPV : 0));

  return (
    <div style={{
      border: "1px solid var(--line)", borderRadius: 10,
      background: "var(--surface)", overflow: "hidden",
    }}>
      <button onClick={onClick} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px", border: "none", background: "transparent",
        textAlign: "left", cursor: "pointer",
      }}>
        <Dot2 color={item.color} />
        <span style={{ fontSize: 13, flex: 1, color: "var(--ink)", minWidth: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
        {!isCost && <ConfidenceChip confidence={conf} hideLabel />}
        <span style={{ color: "var(--muted-2)", fontSize: 12, fontFamily: "var(--mono)",
          minWidth: 56, textAlign: "right" }}>
          {fmtMoney(valuePV)}
        </span>
        {expanded ? <IconChevUp size={14} style={{ color: "var(--muted-2)" }} />
                  : <IconChevDown size={14} style={{ color: "var(--muted-2)" }} />}
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--line)", padding: "16px 16px 14px",
                       background: "var(--surface-2)" }}>
          <div style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.55, marginBottom: 14 }}>
            {item.desc}
          </div>

          {!isCost
            ? <ValueWaterfall item={item} series={series} A={A} />
            : <CostBreakdown item={item} series={series} A={A} />}

          {onRemove && (
            <button onClick={onRemove} style={{
              border: "1px solid var(--line)", background: "transparent",
              color: "var(--muted)", padding: "5px 10px", borderRadius: 8,
              fontSize: 12, marginTop: 12,
            }}>Remove from model</button>
          )}
        </div>
      )}
    </div>
  );
};

// ---------- Value waterfall ----------
// Five-stage horizontal stepped chart: Gross → after Overlap → ×Phase → after Counterfactual → split into Cash + Soft
const ValueWaterfall = ({ item, series, A }) => {
  const max = Math.max(series.grossPV, 1);
  const stages = [
    { key: "gross",    label: "Gross PV",        value: series.grossPV,
      hint: "Present value if nothing went wrong and PA had no alternative.",
      color: "var(--ink-2)", solid: true },
    { key: "overlap",  label: "After overlap",   value: series.overlapPV,
      hint: item.overlap > 0
        ? `${Math.round(item.overlap * 100)}% double-counted with another item — removed.`
        : "No overlap with other items.",
      color: "var(--ink-2)", strike: item.overlap > 0 ? series.grossPV - series.overlapPV : 0 },
    { key: "phase",    label: "After phase risk", value: series.phasePV,
      hint: `Phase ${item.phase} cumulative delivery: ${Math.round(series.phaseFactor * 100)}%.`,
      color: "var(--ink-2)", strike: series.overlapPV - series.phasePV },
    { key: "net",      label: "Incremental net", value: series.netPV,
      hint: item.counterfactual > 0
        ? `${Math.round(item.counterfactual * 100)}% achievable via PA's best alternative — removed.`
        : "No counterfactual capture.",
      color: "var(--ink)", strike: series.phasePV - series.netPV, solid: true },
  ];

  return (
    <div>
      <div style={{
        fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
        color: "var(--eyebrow)", fontWeight: 500, marginBottom: 10,
      }}>Value waterfall</div>

      <div style={{
        border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden",
        background: "var(--surface)",
      }}>
        {stages.map((s, i) => (
          <WaterfallRow key={s.key} stage={s} max={max} prev={i > 0 ? stages[i-1].value : null} />
        ))}
        {/* Cash + Soft split */}
        <div style={{
          padding: "12px 14px", borderTop: "1px solid var(--line)",
          background: "var(--bg-soft)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 11.5, color: "var(--muted)", flex: 1 }}>
              Cash realisation: {Math.round(item.cashRealisation * 100)}%
            </span>
            <span style={{ fontSize: 11.5, color: "var(--muted-2)", fontFamily: "var(--mono)" }}>
              of {fmtMoney(series.netPV)}
            </span>
          </div>
          <div style={{
            display: "flex", height: 22, borderRadius: 6, overflow: "hidden",
            border: "1px solid var(--line)",
          }}>
            <div style={{
              flex: item.cashRealisation || 0.0001,
              background: "var(--green)",
              display: "flex", alignItems: "center", justifyContent: "flex-start",
              padding: "0 10px", color: "white", fontSize: 11, fontWeight: 500,
              fontFamily: "var(--mono)",
            }}>
              {fmtMoney(series.cashPV)} cash
            </div>
            <div style={{
              flex: (1 - item.cashRealisation) || 0.0001,
              background: "color-mix(in srgb, var(--green) 30%, var(--surface))",
              display: "flex", alignItems: "center", justifyContent: "flex-end",
              padding: "0 10px", color: "var(--ink)", fontSize: 11, fontWeight: 500,
              fontFamily: "var(--mono)",
            }}>
              {fmtMoney(series.softPV)} soft
            </div>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
            <strong style={{ color: "var(--ink-2)" }}>Cash</strong> = direct dollars, capex avoided, contract savings.{" "}
            <strong style={{ color: "var(--ink-2)" }}>Soft</strong> = freed time, optionality, capability reuse.
          </div>
        </div>
      </div>
    </div>
  );
};

const WaterfallRow = ({ stage, max, prev }) => {
  const widthPct = Math.max(2, (stage.value / max) * 100);
  return (
    <div style={{
      padding: "10px 14px", borderBottom: "1px solid var(--line)",
      display: "grid", gridTemplateColumns: "150px 1fr 90px",
      gap: 12, alignItems: "center",
    }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: stage.solid ? 600 : 500, color: stage.color }}>
          {stage.label}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted-2)", marginTop: 2, lineHeight: 1.4 }}>
          {stage.hint}
        </div>
      </div>
      <div style={{ position: "relative", height: 20 }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${widthPct}%`,
          background: stage.solid ? "var(--ink)" : "color-mix(in srgb, var(--ink) 35%, transparent)",
          borderRadius: 4,
          opacity: stage.solid ? 0.85 : 0.45,
        }} />
        {prev != null && stage.strike > 0 && (
          <div style={{
            position: "absolute", left: `${widthPct}%`, top: 0, bottom: 0,
            width: `${Math.max(0, (prev - stage.value) / max * 100)}%`,
            background: "repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, var(--red-deep) 25%, transparent) 4px 6px)",
            borderRadius: "0 4px 4px 0",
          }} />
        )}
      </div>
      <div style={{
        fontFamily: "var(--mono)", fontSize: 12, textAlign: "right",
        color: stage.solid ? "var(--ink)" : "var(--ink-2)",
        fontWeight: stage.solid ? 600 : 400,
      }}>
        {fmtMoney(stage.value, { precise: true })}
      </div>
    </div>
  );
};

// ---------- Cost breakdown (symmetric to ValueWaterfall) ----------
const CostBreakdown = ({ item, series, A }) => {
  const yearly = series.cash; // cost is always cash
  const max = Math.max(...yearly, 1);
  const totalNominal = yearly.reduce((a, b) => a + b, 0);
  const totalPV = series.cashPV;
  const startY = item.startYear || 1;
  const formula = item.lump
    ? `One-off in Year ${startY}`
    : `Recurring from Year ${startY} through Year ${HORIZON}`;

  return (
    <div>
      <div style={{
        fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
        color: "var(--eyebrow)", fontWeight: 500, marginBottom: 10,
      }}>Cost schedule</div>

      <div style={{
        border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden",
        background: "var(--surface)",
      }}>
        {/* Year-by-year rows */}
        {yearly.map((v, y) => (
          <div key={y} style={{
            padding: "10px 14px", borderBottom: "1px solid var(--line)",
            display: "grid", gridTemplateColumns: "150px 1fr 90px",
            gap: 12, alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)" }}>
                Year {y + 1}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--muted-2)", marginTop: 2 }}>
                {v > 0 ? (item.lump && y + 1 === startY ? "Lump-sum payment" : "Run cost") : "—"}
              </div>
            </div>
            <div style={{ position: "relative", height: 20 }}>
              <div style={{
                position: "absolute", left: 0, top: 0, bottom: 0,
                width: `${Math.max(2, (v / max) * 100)}%`,
                background: v > 0 ? item.color : "transparent",
                opacity: 0.85,
                borderRadius: 4,
              }} />
            </div>
            <div style={{
              fontFamily: "var(--mono)", fontSize: 12, textAlign: "right",
              color: v > 0 ? "var(--ink)" : "var(--muted-2)",
            }}>
              {v > 0 ? fmtMoney(v, { precise: true }) : "—"}
            </div>
          </div>
        ))}

        {/* Summary row — mirrors the cash/soft split bar on benefits */}
        <div style={{
          padding: "12px 14px",
          background: "var(--bg-soft)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 11.5, color: "var(--muted)", flex: 1 }}>
              {formula} · discounted at {A.discount_rate || 8}%
            </span>
            <span style={{ fontSize: 11.5, color: "var(--muted-2)", fontFamily: "var(--mono)" }}>
              nominal {fmtMoney(totalNominal)}
            </span>
          </div>
          <div style={{
            display: "flex", height: 22, borderRadius: 6, overflow: "hidden",
            border: "1px solid var(--line)",
          }}>
            <div style={{
              flex: 1,
              background: item.color,
              opacity: 0.9,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0 10px", color: "white", fontSize: 11, fontWeight: 500,
              fontFamily: "var(--mono)",
            }}>
              <span>Cash outflow PV</span>
              <span>{fmtMoney(totalPV)}</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
            All costs are <strong style={{ color: "var(--ink-2)" }}>cash</strong> outflows — no risk
            adjustments are applied to costs in this model.
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- Add item modal ----------
// Generic placeholder templates. Customise per project — these don't reference
// any specific assumption ids, so they slot into any model.
const ADD_TEMPLATES = [
  { id: "extra_one_off_cost",  kind: "cost",    name: "One-off cost",
    color: "var(--c-orange)",
    desc: "Generic one-off cost in year 1. Edit the value after adding.",
    lump: true, startYear: 1, phase: 0,
    overlap: 0, counterfactual: 0, cashRealisation: 1.0,
    gross: () => 50000, uses: [] },
  { id: "extra_recurring_cost", kind: "cost",   name: "Recurring cost",
    color: "var(--c-purple)",
    desc: "Generic annual recurring cost across the horizon. Edit the value after adding.",
    lump: false, startYear: 1, phase: 0,
    overlap: 0, counterfactual: 0, cashRealisation: 1.0,
    gross: () => 25000, uses: [] },
  { id: "extra_cash_benefit",  kind: "benefit", name: "Cash benefit",
    color: "var(--c-mint)",
    desc: "Generic recurring cash benefit. Edit the value, phase, and counterfactual after adding.",
    lump: false, startYear: 2, phase: 1,
    overlap: 0.0, counterfactual: 0.10, cashRealisation: 1.0,
    gross: () => 75000, uses: [] },
  { id: "extra_soft_benefit",  kind: "benefit", name: "Soft benefit",
    color: "var(--c-mintlight)",
    desc: "Generic recurring soft benefit (freed time, optionality). Edit the value after adding.",
    lump: false, startYear: 2, phase: 2,
    overlap: 0.0, counterfactual: 0.20, cashRealisation: 0.30,
    gross: () => 40000, uses: [] },
];

const AddItemModal = ({ kind, onClose, onAdd, existingIds }) => {
  const options = ADD_TEMPLATES.filter(t => t.kind === kind && !existingIds.includes(t.id));
  return (
    <Modal title={`Add ${kind === "cost" ? "a cost" : "a benefit"}`} onClose={onClose} width={580}>
      <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 18 }}>
        Pick a template — CBAgent will wire it into the model with your existing assumptions.
        Adjust the assumptions in the right rail to refine.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {options.map(t => (
          <button key={t.id} onClick={() => { onAdd(t); onClose(); }} style={{
            border: "1px solid var(--line)", borderRadius: 12,
            padding: "14px 16px", background: "var(--surface-2)",
            textAlign: "left", display: "flex", alignItems: "flex-start", gap: 12,
            cursor: "pointer",
          }}>
            <Dot2 color={t.color} size={10} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{t.name}</div>
              <div style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.5 }}>{t.desc}</div>
            </div>
            <IconArrowRight size={14} style={{ color: "var(--muted)", marginTop: 4 }} />
          </button>
        ))}
        {options.length === 0 && (
          <div style={{ color: "var(--muted)", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
            All available templates are already in your model.
          </div>
        )}
      </div>
    </Modal>
  );
};

Object.assign(window, { ItemRow, AddItemModal, ADD_TEMPLATES, ConfidenceChip });

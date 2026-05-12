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
const ItemRow = ({ item, series, A, expanded, selected, onClick, onRemove, onEdit, includeSoft }) => {
  const conf = itemConfidence(item, A);
  const isCost = item.kind === "cost";
  const valuePV = isCost ? series.cashPV : (series.cashPV + (includeSoft ? series.softPV : 0));

  return (
    <div style={{
      border: selected ? `1.5px solid ${item.color}` : "1px solid var(--line)",
      borderRadius: 10,
      background: "var(--surface)", overflow: "hidden",
      boxShadow: selected ? `0 0 0 3px color-mix(in srgb, ${item.color} 12%, transparent)` : undefined,
      transition: "border-color 120ms, box-shadow 120ms",
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

          {(onEdit || onRemove) && (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {onEdit && (
                <button onClick={onEdit} style={{
                  border: "1px solid var(--line)", background: "var(--surface)",
                  color: "var(--ink-2)", padding: "5px 10px", borderRadius: 8,
                  fontSize: 12, cursor: "pointer",
                }}>Edit</button>
              )}
              {onRemove && (
                <button onClick={onRemove} style={{
                  border: "1px solid var(--line)", background: "transparent",
                  color: "var(--muted)", padding: "5px 10px", borderRadius: 8,
                  fontSize: 12, cursor: "pointer",
                }}>Remove from model</button>
              )}
            </div>
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

// ---------- Add item wizard ----------
// Guides the user through identity → formula → timing → realisation,
// with inline-create for new estimates. Auto-derives `uses` from the
// formula so item↔assumption links work for selection highlighting.

const __WIZARD_ICONS = ["IconDollar","IconPercent","IconClock","IconUsers","IconShield","IconTrend","IconBolt","IconLeaf","IconBuilding","IconCube"];
const __WIZARD_GROUPS = ["Financial","Engagement","Operations","Delivery Confidence"];

const __slugify = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const __uniqueId = (base, taken) => {
  let id = base, n = 2;
  while (taken.includes(id)) { id = `${base}_${n++}`; }
  return id;
};

const WizardSection = ({ step, title, subtitle, children }) => (
  <div style={{
    border: "1px solid var(--line)", borderRadius: 14, padding: 16,
    background: "var(--surface)", marginBottom: 12,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
      <span style={{
        width: 22, height: 22, borderRadius: 999, background: "var(--bg-soft)",
        border: "1px solid var(--line)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", fontWeight: 600,
      }}>{step}</span>
      <span style={{ fontSize: 14, fontWeight: 500 }}>{title}</span>
    </div>
    {subtitle && (
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 12, paddingLeft: 32 }}>
        {subtitle}
      </div>
    )}
    <div style={{ paddingLeft: 32 }}>{children}</div>
  </div>
);

const FieldLabel = ({ children, style }) => (
  <div style={{
    fontSize: 11, fontWeight: 500, color: "var(--muted)", marginBottom: 6,
    textTransform: "uppercase", letterSpacing: "0.06em", ...style,
  }}>{children}</div>
);
const TextInput = ({ value, onChange, placeholder, innerRef }) => (
  <input ref={innerRef} type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    style={{
      width: "100%", border: "1px solid var(--line-strong)", borderRadius: 8,
      background: "var(--surface-2)", padding: "9px 12px",
      fontSize: 13.5, color: "var(--ink)", outline: "none", boxSizing: "border-box",
    }} />
);
const TextArea = ({ value, onChange, placeholder, rows }) => (
  <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows || 3}
    style={{
      width: "100%", border: "1px solid var(--line-strong)", borderRadius: 8,
      background: "var(--surface-2)", padding: "9px 12px",
      fontSize: 13, color: "var(--ink)", outline: "none", boxSizing: "border-box",
      fontFamily: "var(--sans)", lineHeight: 1.5, resize: "vertical",
    }} />
);
const SelectInput = ({ value, onChange, options }) => (
  <select value={value} onChange={e => onChange(e.target.value)} style={{
    width: "100%", border: "1px solid var(--line-strong)", borderRadius: 8,
    background: "var(--surface-2)", padding: "9px 10px", fontSize: 13, color: "var(--ink)",
  }}>{options.map(o => typeof o === "string"
    ? <option key={o} value={o}>{o}</option>
    : <option key={o.value} value={o.value}>{o.label}</option>)}</select>
);
const FieldGrid = ({ children, style }) => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, ...style }}>{children}</div>
);
const Field = ({ label, help, children }) => (
  <div>
    <FieldLabel>{label}</FieldLabel>
    {children}
    {help && <div style={{ fontSize: 10.5, color: "var(--muted-2)", marginTop: 4, lineHeight: 1.4 }}>{help}</div>}
  </div>
);

const AssumptionForm = ({ existingIds, onSave, onCancel, defaultUnit, editing }) => {
  const isEdit = !!editing;
  const [label, setLabel] = React.useState(editing?.label || "");
  const [value, setValue] = React.useState(editing?.value ?? 0);
  const [unit, setUnit] = React.useState(editing?.unit || defaultUnit || "$");
  const [step, setStep] = React.useState(editing?.step ?? 1000);
  const [group, setGroup] = React.useState(editing?.group || __WIZARD_GROUPS[0]);
  const [icon, setIcon] = React.useState(editing?.icon || "IconDollar");
  const [description, setDescription] = React.useState(editing?.description || "");
  const [rationale, setRationale] = React.useState(editing?.rationale || "");
  const [source, setSource] = React.useState(editing?.source || "");
  const [domain, setDomain] = React.useState(editing?.domain || "internal");
  const [sensLo, setSensLo] = React.useState(editing?.sensitivityRange?.lo ?? 0.5);
  const [sensHi, setSensHi] = React.useState(editing?.sensitivityRange?.hi ?? 1.5);

  // When editing, keep the original id so formulas keep working.
  const id = isEdit ? editing.id : __uniqueId(__slugify(label) || "new_estimate", existingIds);
  const valid = label.trim() && description.trim() && rationale.trim() && Number.isFinite(value);

  return (
    <>
      <FieldLabel>Label</FieldLabel>
      <TextInput value={label} onChange={setLabel} placeholder="e.g. Annual run cost" />
      <div style={{ fontSize: 11, color: "var(--muted-2)", fontFamily: "var(--mono)", marginTop: 4 }}>id: {id}</div>

      <FieldGrid style={{ marginTop: 12 }}>
        <Field label="Value"><NumberInput value={value} step={step} unit={unit} onChange={setValue} /></Field>
        <Field label="Unit">
          <SelectInput value={unit} onChange={setUnit}
            options={[{value:"$",label:"$"},{value:"$/yr",label:"$/yr"},{value:"%",label:"%"},{value:"yrs",label:"yrs"},{value:"",label:"—"}]} />
        </Field>
        <Field label="Step (input increment)"><NumberInput value={step} step={1} onChange={setStep} /></Field>
        <Field label="Group"><SelectInput value={group} onChange={setGroup} options={__WIZARD_GROUPS} /></Field>
      </FieldGrid>

      <FieldLabel style={{ marginTop: 14 }}>Description (what this represents)</FieldLabel>
      <TextArea value={description} onChange={setDescription}
        placeholder="One or two sentences. What does this measure?" rows={2} />

      <FieldLabel style={{ marginTop: 12 }}>Rationale (why this value)</FieldLabel>
      <TextArea value={rationale} onChange={setRationale}
        placeholder="Why this number? Internal data, vendor quote, benchmark, or Fermi estimate." rows={2} />

      <FieldGrid style={{ marginTop: 12 }}>
        <Field label="Source"><TextInput value={source} onChange={setSource} placeholder="e.g. Vendor proposal" /></Field>
        <Field label="Domain"><SelectInput value={domain} onChange={setDomain} options={["internal","external"]} /></Field>
        <Field label="Sensitivity low (×base)" help="Used in the tornado chart."><NumberInput value={sensLo} step={0.05} onChange={setSensLo} /></Field>
        <Field label="Sensitivity high (×base)"><NumberInput value={sensHi} step={0.05} onChange={setSensHi} /></Field>
      </FieldGrid>

      <FieldLabel style={{ marginTop: 14 }}>Icon</FieldLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {__WIZARD_ICONS.map(iname => {
          const Icn = window[iname] || IconCube;
          const sel = icon === iname;
          return (
            <button key={iname} onClick={() => setIcon(iname)} title={iname}
              style={{
                width: 28, height: 28,
                border: sel ? "1.5px solid var(--ink)" : "1px solid var(--line-strong)",
                borderRadius: 8, background: "var(--surface-2)",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "var(--ink)",
              }}><Icn size={14} /></button>
          );
        })}
      </div>

      <div style={{
        display: "flex", justifyContent: "flex-end", gap: 8,
        marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line)",
      }}>
        <Pill2 onClick={onCancel}>Cancel</Pill2>
        <Pill2 primary
          style={{ opacity: valid ? 1 : 0.5, pointerEvents: valid ? "auto" : "none" }}
          onClick={() => valid && onSave({
            id, label: label.trim(), value, unit, step, group, icon,
            description: description.trim(), rationale: rationale.trim(),
            source: source.trim(), domain,
            sensitivityRange: { lo: sensLo, hi: sensHi },
          })}>{isEdit ? "Save changes" : "Save estimate"}</Pill2>
      </div>
    </>
  );
};

const AddItemWizard = ({ kind, onClose, onAdd, existingIds, assumptions, categoryColors, editingItem }) => {
  const isCost = kind === "cost";
  const isEdit = !!editingItem;

  // Category list — prefer ones whose key includes the kind (cost_*, benefit_*)
  // when such a convention is used, but fall back to all if nothing matches.
  const categoryOptions = React.useMemo(() => {
    const all = Object.entries(categoryColors);
    const matching = all.filter(([cid]) => cid.toLowerCase().includes(kind));
    return matching.length ? matching : all;
  }, [categoryColors, kind]);

  const [name, setName] = React.useState(editingItem?.name || "");
  const [desc, setDesc] = React.useState(editingItem?.desc || "");
  const [category, setCategory] = React.useState(() =>
    editingItem?.category || categoryOptions[0]?.[0] || ""
  );
  const [gross, setGross] = React.useState(editingItem?._grossSrc || "");
  const [lump, setLump] = React.useState(editingItem ? !!editingItem.lump : isCost);
  const [startYear, setStartYear] = React.useState(editingItem?.startYear ?? (isCost ? 1 : 2));
  const [horizonOverride, setHorizonOverride] = React.useState(editingItem?.horizonOverride || "");
  const [overlap, setOverlap] = React.useState(editingItem?.overlap ?? 0);
  const [counterfactual, setCounterfactual] = React.useState(editingItem?.counterfactual ?? (isCost ? 0 : 0.10));
  const [cashRealisation, setCashRealisation] = React.useState(editingItem?.cashRealisation ?? 1.0);
  const [phase, setPhase] = React.useState(editingItem?.phase ?? (isCost ? 0 : 1));

  const [pendingAssumptions, setPendingAssumptions] = React.useState([]);
  const [showAddAss, setShowAddAss] = React.useState(false);

  const allAssumptions = React.useMemo(
    () => [...assumptions, ...pendingAssumptions],
    [assumptions, pendingAssumptions]
  );
  const allAssIds = React.useMemo(() => allAssumptions.map(a => a.id), [allAssumptions]);
  const formulaError = gross ? validateFormula(gross, allAssIds) : "formula is required";
  const formulaIds = React.useMemo(
    () => extractAssumptionIds(gross, allAssIds),
    [gross, allAssIds]
  );

  const grossInputRef = React.useRef(null);
  const insertAtCursor = (text) => {
    const el = grossInputRef.current;
    if (!el) { setGross(g => (g ? g + " " : "") + text); return; }
    const s = el.selectionStart ?? gross.length;
    const e = el.selectionEnd ?? gross.length;
    const next = gross.slice(0, s) + text + gross.slice(e);
    setGross(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = s + text.length;
      try { el.setSelectionRange(pos, pos); } catch {}
    });
  };

  // Preserve id when editing; otherwise generate a unique one
  const itemId = isEdit
    ? editingItem.id
    : __uniqueId(`${kind}_${__slugify(name) || "new"}`, existingIds);

  const errors = [];
  if (!name.trim()) errors.push("name");
  if (!desc.trim()) errors.push("description");
  if (!category) errors.push("category");
  if (formulaError) errors.push("formula");
  if (startYear < 1 || startYear > HORIZON) errors.push("startYear");
  for (const [n, v] of [["overlap", overlap], ["counterfactual", counterfactual], ["cashRealisation", cashRealisation]]) {
    if (v < 0 || v > 1) errors.push(n);
  }
  if (phase < 0 || phase > 4) errors.push("phase");
  const valid = errors.length === 0;

  const handleSubmit = () => {
    if (!valid) return;
    const item = {
      // When editing, preserve the existing item's untouched fields (e.g. `removable`)
      ...(editingItem || {}),
      id: itemId, kind, name: name.trim(), desc: desc.trim(),
      category, color: categoryColors[category] || "var(--muted-2)",
      lump, startYear,
      ...(horizonOverride ? { horizonOverride } : {}),
      phase, overlap, counterfactual, cashRealisation,
      _grossSrc: gross,
      gross: compileFormula(gross, allAssIds),
      uses: formulaIds,
    };
    onAdd({ item, newAssumptions: pendingAssumptions, isEdit });
    onClose();
  };

  if (showAddAss) {
    return (
      <Modal title="Add a new estimate" onClose={() => setShowAddAss(false)} width={560}>
        <AssumptionForm
          existingIds={allAssIds}
          defaultUnit={isCost ? "$/yr" : "$/yr"}
          onSave={(a) => {
            setPendingAssumptions(p => [...p, a]);
            setShowAddAss(false);
            requestAnimationFrame(() => insertAtCursor(a.id));
          }}
          onCancel={() => setShowAddAss(false)}
        />
      </Modal>
    );
  }

  return (
    <Modal title={isEdit ? `Edit ${isCost ? "cost" : "benefit"}` : `Add a ${isCost ? "cost" : "benefit"}`} onClose={onClose} width={720}>
      <WizardSection step={1} title="Identity" subtitle="What is this and where does it sit?">
        <FieldLabel>Name</FieldLabel>
        <TextInput value={name} onChange={setName}
          placeholder={isCost ? "e.g. Implementation fee" : "e.g. Reduced churn"} />

        <FieldLabel style={{ marginTop: 14 }}>
          {isCost ? "Description (what triggers this and what's paid)" : "Value chain — action → world change → dollars → capture"}
        </FieldLabel>
        <TextArea value={desc} onChange={setDesc} rows={4}
          placeholder={isCost
            ? "What outflow this represents and when. Name the resource and the cause."
            : "1. What action does the project take?\n2. What changes about the world as a result?\n3. How is that worth dollars?\n4. Who actually captures the dollars?"} />

        <FieldLabel style={{ marginTop: 14 }}>Category</FieldLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {categoryOptions.map(([cid, color]) => (
            <button key={cid} onClick={() => setCategory(cid)} style={{
              border: category === cid ? `1.5px solid ${color}` : "1px solid var(--line-strong)",
              background: category === cid ? `color-mix(in srgb, ${color} 14%, var(--surface))` : "var(--surface)",
              color: "var(--ink)", padding: "5px 10px", borderRadius: 999,
              fontSize: 12, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              <Dot2 color={color} size={7} /> {cid}
            </button>
          ))}
        </div>
      </WizardSection>

      <WizardSection step={2} title="Formula"
        subtitle="Gross dollar amount per year, expressed as a formula over your estimates.">
        <FieldLabel>Gross formula</FieldLabel>
        <input ref={grossInputRef} type="text" value={gross}
          onChange={e => setGross(e.target.value)}
          placeholder={isCost ? "e.g. annual_run_cost" : "e.g. customers * arpu * retention_lift"}
          style={{
            width: "100%", border: "1px solid var(--line-strong)", borderRadius: 8,
            background: "var(--surface-2)", padding: "10px 12px",
            fontFamily: "var(--mono)", fontSize: 13.5, color: "var(--ink)", outline: "none",
            boxSizing: "border-box",
          }} />
        <div style={{ marginTop: 6, fontSize: 11.5, color: formulaError ? "var(--red-deep)" : "var(--muted)" }}>
          {formulaError || (formulaIds.length
            ? `Uses: ${formulaIds.join(", ")}`
            : "Click an estimate below to insert it.")}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {allAssumptions.map(a => (
            <button key={a.id} onClick={() => insertAtCursor(a.id)} style={{
              border: "1px solid var(--line)", background: "var(--surface-2)",
              color: "var(--ink-2)", padding: "4px 8px", borderRadius: 6,
              fontFamily: "var(--mono)", fontSize: 11.5, cursor: "pointer",
            }}>
              {a.id}
              {a.unit && <span style={{ color: "var(--muted-2)", marginLeft: 6 }}>{a.unit}</span>}
            </button>
          ))}
          <button onClick={() => setShowAddAss(true)} style={{
            border: "1px dashed var(--line-strong)", background: "transparent",
            color: "var(--muted)", padding: "4px 8px", borderRadius: 6,
            fontSize: 11.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
          }}><IconPlus size={11} /> New estimate</button>
        </div>
      </WizardSection>

      <WizardSection step={3} title="Timing" subtitle="When does this land?">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 13 }}>One-off (lump)</span>
          <Toggle2 on={lump} onChange={setLump} />
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
            {lump ? "Single payment in start year" : `Recurring from start year through Year ${HORIZON}`}
          </span>
        </div>
        <FieldGrid>
          <Field label="Start year" help={`1 to ${HORIZON}`}>
            <NumberInput value={startYear} step={1} unit={`/ ${HORIZON}`}
              onChange={(v) => setStartYear(Math.max(1, Math.min(HORIZON, Math.round(v))))} />
          </Field>
          {!lump && (
            <Field label="Cap duration with an estimate (optional)" help="Pick an estimate in years to limit how long this runs.">
              <SelectInput value={horizonOverride} onChange={setHorizonOverride}
                options={[{value:"",label:"— full horizon —"}, ...allAssumptions.filter(a => a.unit !== "$").map(a => ({value: a.id, label: `${a.id} (${a.label})`}))]} />
            </Field>
          )}
        </FieldGrid>
      </WizardSection>

      <WizardSection step={4} title="Realisation & risk"
        subtitle="How much of the gross actually accrues?">
        <FieldGrid>
          <Field label="Overlap (0..1)" help="Fraction already counted in another item.">
            <NumberInput value={overlap} step={0.05} onChange={setOverlap} />
          </Field>
          <Field label="Counterfactual (0..1)" help="Fraction achievable via the best alternative.">
            <NumberInput value={counterfactual} step={0.05} onChange={setCounterfactual} />
          </Field>
          {!isCost && (
            <Field label="Cash realisation (0..1)" help="Fraction realised as cash vs soft (freed time, optionality).">
              <NumberInput value={cashRealisation} step={0.05} onChange={setCashRealisation} />
            </Field>
          )}
          {!isCost && (
            <Field label="Phase (0..4)" help="Cumulative delivery-risk gate (p1..p4).">
              <NumberInput value={phase} step={1}
                onChange={(v) => setPhase(Math.max(0, Math.min(4, Math.round(v))))} />
            </Field>
          )}
        </FieldGrid>
      </WizardSection>

      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)",
      }}>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
          {valid
            ? (isEdit ? `Will update ${itemId}` : `Will be added as ${itemId}`)
            : `Missing: ${errors.join(", ")}`}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <Pill2 onClick={onClose}>Cancel</Pill2>
          <Pill2 primary onClick={handleSubmit}
            style={{ opacity: valid ? 1 : 0.5, pointerEvents: valid ? "auto" : "none" }}>
            {isEdit ? "Save changes" : "Add to model"}
          </Pill2>
        </div>
      </div>
    </Modal>
  );
};

Object.assign(window, { ItemRow, AddItemWizard, AssumptionForm, ConfidenceChip });

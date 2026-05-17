// AssumptionForm — modal-friendly editor for a single assumption.
// Used by the all-assumptions grid's edit affordance.

const __WIZARD_ICONS = ["IconDollar","IconPercent","IconClock","IconUsers","IconShield","IconTrend","IconBolt","IconLeaf","IconBuilding","IconCube"];
const __WIZARD_GROUPS = ["Financial","Engagement","Operations","Delivery Confidence"];

const __slugify = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const __uniqueId = (base, taken) => {
  let id = base, n = 2;
  while (taken.includes(id)) { id = `${base}_${n++}`; }
  return id;
};

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
  const [source, setSource] = React.useState(editing?.source || "");
  const [sensLo, setSensLo] = React.useState(editing?.sensitivityRange?.lo ?? 0.5);
  const [sensHi, setSensHi] = React.useState(editing?.sensitivityRange?.hi ?? 1.5);

  // When editing, keep the original id so formulas keep working.
  const id = isEdit ? editing.id : __uniqueId(__slugify(label) || "new_estimate", existingIds);
  const valid = label.trim() && description.trim() && Number.isFinite(value);

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

      <FieldLabel style={{ marginTop: 14 }}>Description (what this represents and why this value)</FieldLabel>
      <TextArea value={description} onChange={setDescription}
        placeholder="One or two sentences. What does this measure, and why this number?" rows={3} />

      <FieldGrid style={{ marginTop: 12 }}>
        <Field label="Source"><TextInput value={source} onChange={setSource} placeholder="e.g. Vendor proposal" /></Field>
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
            description: description.trim(),
            source: source.trim(),
            sensitivityRange: { lo: sensLo, hi: sensHi },
          })}>{isEdit ? "Save changes" : "Save estimate"}</Pill2>
      </div>
    </>
  );
};

Object.assign(window, { AssumptionForm });

// Shared UI atoms for v2

const Eyebrow2 = ({ children, style }) => (
  <div style={{
    fontSize: 11, fontWeight: 500, letterSpacing: "0.12em",
    textTransform: "uppercase", color: "var(--eyebrow)",
    ...style,
  }}>{children}</div>
);

const Card2 = ({ children, style, padding = 20 }) => (
  <div style={{
    background: "var(--surface)", border: "1px solid var(--line)",
    borderRadius: 20, boxShadow: "0 1px 0 rgba(20,19,15,0.04), 0 1px 2px rgba(20,19,15,0.04)",
    padding, ...style,
  }}>{children}</div>
);

const Dot2 = ({ color, size = 8 }) => (
  <span style={{
    display: "inline-block", width: size, height: size, borderRadius: 999,
    background: color, flex: "0 0 auto",
  }} />
);

const Toggle2 = ({ on, onChange }) => (
  <button onClick={() => onChange(!on)} style={{
    width: 34, height: 20, borderRadius: 999,
    background: on ? "var(--green)" : "var(--line-strong)",
    position: "relative", display: "inline-block",
    transition: "background 120ms",
    border: "none", padding: 0,
  }}>
    <span style={{
      position: "absolute", top: 2, left: on ? 16 : 2,
      width: 16, height: 16, background: "white", borderRadius: 999,
      boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
      transition: "left 120ms",
    }} />
  </button>
);

const Pill2 = ({ children, primary, onClick, style }) => (
  <button onClick={onClick} style={{
    border: primary ? "1px solid var(--ink)" : "1px solid var(--line-strong)",
    background: primary ? "var(--ink)" : "var(--surface)",
    color: primary ? "var(--bg)" : "var(--ink)",
    padding: "9px 16px", borderRadius: 999, fontSize: 13, fontWeight: 500,
    display: "inline-flex", alignItems: "center", gap: 8, ...style,
  }}>{children}</button>
);

// Number input with formatting + units
const NumberInput = ({ value, onChange, unit, step = 1, placeholder, style }) => {
  const [text, setText] = React.useState(String(value));
  React.useEffect(() => { setText(String(value)); }, [value]);
  const handle = (s) => {
    setText(s);
    const n = parseFloat(s);
    if (!isNaN(n)) onChange(n);
  };
  return (
    <div style={{
      display: "flex", alignItems: "center",
      border: "1px solid var(--line-strong)", borderRadius: 8,
      background: "var(--surface-2)", overflow: "hidden",
      ...style,
    }}>
      <input
        type="text" inputMode="decimal" placeholder={placeholder}
        value={text} step={step}
        onChange={e => handle(e.target.value)}
        onBlur={e => handle(e.target.value)}
        style={{
          flex: 1, minWidth: 0,
          background: "transparent", border: "none", outline: "none",
          padding: "8px 10px", fontFamily: "var(--mono)", fontSize: 13.5,
          color: "var(--ink)",
        }}
      />
      {unit && <span style={{
        padding: "0 10px", fontSize: 11, color: "var(--muted-2)",
        fontFamily: "var(--mono)", borderLeft: "1px solid var(--line)",
        height: "100%", display: "inline-flex", alignItems: "center",
      }}>{unit}</span>}
    </div>
  );
};

// Modal shell
const Modal = ({ title, onClose, children, width = 520 }) => (
  <div className="modal-backdrop" onClick={onClose}>
    <div onClick={e => e.stopPropagation()} style={{
      background: "var(--surface)", borderRadius: 18,
      width: "100%", maxWidth: width, maxHeight: "85vh",
      overflow: "auto", border: "1px solid var(--line)",
      boxShadow: "0 24px 48px rgba(0,0,0,0.25)",
    }}>
      <div style={{
        padding: "18px 24px", borderBottom: "1px solid var(--line)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 500 }}>{title}</div>
        <button onClick={onClose} style={{
          border: "none", background: "transparent", color: "var(--muted)",
          fontSize: 20, lineHeight: 1, padding: 4,
        }}>×</button>
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  </div>
);

const SourceTag = ({ domain, source }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    <span style={{
      width: 14, height: 14, borderRadius: 3,
      background: domain === "internal"
        ? "var(--bg-soft)"
        : "linear-gradient(135deg, #FF7A00, #FFC15B)",
      border: "1px solid var(--line)",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: 8, color: "white", fontWeight: 700,
    }}>{(domain || "?")[0].toUpperCase()}</span>
    <span style={{ fontSize: 11, color: "var(--muted)" }}>
      <span style={{ fontFamily: "var(--mono)" }}>{domain}</span>
      {source && <> · {source}</>}
    </span>
  </div>
);

Object.assign(window, { Eyebrow2, Card2, Dot2, Toggle2, Pill2, NumberInput, Modal, SourceTag });

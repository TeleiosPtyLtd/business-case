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

// ============================================================================
// HelpTip — small `?` icon with a portal-rendered tooltip giving a formal
// definition and a plain-English explanation. Drop-in replacement for the
// IconHelp glyph everywhere a concept needs unpacking for a lay reader.
//
//   <HelpTip topic="npv" />               // pull from registry
//   <HelpTip title="Foo">Custom body</HelpTip>   // inline content
// ============================================================================

const HELP_TOPICS = {
  npv: {
    title: "Net Present Value (NPV)",
    body: (
      <>
        <p style={{ margin: "0 0 8px" }}>
          The sum of every future cash flow — costs and benefits — discounted
          back to today's dollars.
        </p>
        <p style={{ margin: 0 }}>
          In plain terms: if you'll spend money over several years and earn
          some back, NPV asks <em>"what is all of it worth right now?"</em>.
          Future dollars are penalised because a dollar in five years is worth
          less than one today (inflation, opportunity cost, risk). A positive
          NPV means the project comes out ahead after all the discounting.
        </p>
      </>
    ),
  },
  bcr: {
    title: "Benefit Cost Ratio (BCR)",
    body: (
      <>
        <p style={{ margin: "0 0 8px" }}>
          Total benefits divided by total costs, both expressed in
          present-value dollars.
        </p>
        <p style={{ margin: 0 }}>
          For every dollar you spend, how many come back? <strong>Above
          1.0</strong> means you come out ahead — 3.0 means $3 returned per $1
          spent. <strong>Below 1.0</strong> means the project doesn't pay for
          itself, even before accounting for risk.
        </p>
      </>
    ),
  },
  irr: {
    title: "Internal Rate of Return (IRR)",
    body: (
      <>
        <p style={{ margin: "0 0 8px" }}>
          The discount rate at which the project's NPV would equal zero.
        </p>
        <p style={{ margin: 0 }}>
          Imagine the project as a savings account: what yearly interest rate
          would it have to pay to give you exactly these returns? Higher IRR
          means a better project — compare it to your other options. IRR can
          show as <em>"—"</em> when the cash-flow pattern doesn't have a
          single unambiguous answer (e.g. it flips sign more than once over
          the horizon).
        </p>
      </>
    ),
  },
  estimates: {
    title: "Estimates",
    body: (
      <>
        <p style={{ margin: "0 0 8px" }}>
          The editable input assumptions that drive every cost and benefit in
          the model.
        </p>
        <p style={{ margin: 0 }}>
          These are the numbers you can change to ask <em>"what if?"</em>. The
          whole model — every NPV, every chart — recalculates as you nudge
          them. Each one carries a description, a rationale, and a source so
          you can trust or push back on where it came from. Use the{" "}
          <strong>↕ impact</strong> toggle to rank them by how much each one
          moves NPV.
        </p>
      </>
    ),
  },
  soft: {
    title: "Soft value",
    body: (
      <>
        <p style={{ margin: "0 0 8px" }}>
          Benefits that <em>don't</em> leave a budget line — freed time,
          retained optionality, capability reuse — as opposed to cash that
          actually arrives in a bank account.
        </p>
        <p style={{ margin: 0 }}>
          Real, but harder to spend. Toggling soft value on includes these in
          NPV; off shows the cash-only view. CFOs typically trust cash-only;
          champions argue for cash + soft.
        </p>
      </>
    ),
  },
};

const HelpTip = ({ topic, title: titleProp, children, size = 13, color }) => {
  const fallback = topic ? HELP_TOPICS[topic] : null;
  const title = titleProp || fallback?.title;
  const body  = children || fallback?.body;
  const [open, setOpen] = React.useState(false);
  const [pos, setPos]   = React.useState({ top: 0, left: 0, side: "top" });
  const triggerRef      = React.useRef(null);

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const TIP_W = 300;
    const GAP = 8;
    const left = Math.max(8, Math.min(window.innerWidth - TIP_W - 8, r.left + r.width / 2 - TIP_W / 2));
    // If there isn't enough room above for the tooltip, flip below.
    const wantsBottom = r.top < 220;
    const top = wantsBottom ? r.bottom + GAP : r.top - GAP;
    setPos({ top, left, side: wantsBottom ? "bottom" : "top" });
  };
  const show = () => { place(); setOpen(true); };
  const hide = () => setOpen(false);

  if (!title && !body) return null;
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => { e.preventDefault(); open ? hide() : show(); }}
        aria-label={title ? `Help: ${title}` : "Help"}
        style={{
          background: "transparent", border: "none",
          padding: 2, margin: 0, color: color || "var(--muted-2)",
          cursor: "help", lineHeight: 0,
          display: "inline-flex", alignItems: "center",
        }}
      ><IconHelp size={size} /></button>
      {open && ReactDOM.createPortal(
        <div role="tooltip" style={{
          position: "fixed",
          top: pos.top, left: pos.left,
          transform: pos.side === "top" ? "translateY(-100%)" : "none",
          width: 300, maxWidth: "calc(100vw - 16px)",
          background: "var(--surface)",
          border: "1px solid var(--line-strong)",
          borderRadius: 10, padding: "12px 14px",
          boxShadow: "0 12px 28px rgba(0,0,0,0.12)",
          zIndex: 1000,
          fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-2)",
          pointerEvents: "none",
        }}>
          {title && (
            <div style={{
              fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase",
              color: "var(--eyebrow)", fontWeight: 500, marginBottom: 8,
            }}>{title}</div>
          )}
          <div>{body}</div>
        </div>,
        document.body
      )}
    </>
  );
};

Object.assign(window, { Eyebrow2, Card2, Dot2, Toggle2, Pill2, NumberInput, Modal, SourceTag, HelpTip, HELP_TOPICS });

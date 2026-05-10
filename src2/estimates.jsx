// Estimates rail — editable assumptions

const IconMap = {
  IconUsers, IconDollar, IconPercent, IconTrend, IconBolt, IconLeaf,
  IconBuilding, IconClock, IconShield,
};

const EstimatesRail = ({ assumptions, setAssumption, items }) => {
  const [expanded, setExpanded] = React.useState(null);

  // Group accepted assumptions by group
  const groups = {};
  for (const a of assumptions) {
    (groups[a.group] = groups[a.group] || []).push(a);
  }

  return (
    <Card2 padding={0} style={{ borderRadius: 20, overflow: "hidden" }}>
      <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Estimates</span>
          <IconHelp size={13} style={{ color: "var(--muted-2)" }} />
          <span style={{
            marginLeft: "auto", fontSize: 11,
            color: "var(--muted-2)", fontFamily: "var(--mono)",
          }}>{assumptions.length} variables</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--muted)" }}>
          Editable inputs that drive every cost and benefit. Click a row for context.
        </div>
      </div>

      <div style={{
        padding: "14px 14px 0", maxHeight: "calc(100vh - 220px)", overflow: "auto",
      }}>
        {Object.entries(groups).map(([gname, gitems]) => (
          <div key={gname} style={{ marginBottom: 6 }}>
            <div style={{
              padding: "6px 4px 8px",
              fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
              color: "var(--eyebrow)", fontWeight: 500,
            }}>{gname}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              {gitems.map(a => (
                <EstimateCard
                  key={a.id} a={a}
                  expanded={expanded === a.id}
                  onToggle={() => setExpanded(expanded === a.id ? null : a.id)}
                  onChange={(v) => setAssumption(a.id, v)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

    </Card2>
  );
};

const EstimateCard = ({ a, expanded, onToggle, onChange }) => {
  const Icn = IconMap[a.icon] || IconCube;
  return (
    <div style={{
      border: "1px solid var(--line)", borderRadius: 14,
      padding: 12, background: "var(--surface)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{
          width: 22, height: 22, borderRadius: 6,
          background: "var(--bg-soft)", border: "1px solid var(--line)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: "var(--muted)", flex: "0 0 auto",
        }}><Icn size={12} /></span>
        <span style={{ fontSize: 12.5, fontWeight: 500, flex: 1, minWidth: 0 }}>{a.label}</span>
        <IconDots size={14} style={{ color: "var(--muted-2)" }} />
      </div>
      <NumberInput
        value={a.value} step={a.step}
        onChange={onChange}
        unit={a.unit}
      />
      {expanded && (
        <div style={{ marginTop: 10 }}>
          {a.description && (
            <div style={{ color: "var(--ink-2)", fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>
              {a.description}
            </div>
          )}
          <div style={{ color: "var(--muted)", fontSize: 11.5, lineHeight: 1.5,
                        paddingTop: 8, borderTop: "1px dashed var(--line)" }}>
            <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
                           color: "var(--eyebrow)", display: "block", marginBottom: 4 }}>Rationale</span>
            {a.rationale}
          </div>
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--line)" }}>
            <SourceTag domain={a.domain} source={a.source} />
          </div>
        </div>
      )}
      <button onClick={onToggle} style={{
        marginTop: 8, border: "none", background: "transparent",
        color: "var(--muted)", fontSize: 11.5,
        display: "inline-flex", alignItems: "center", gap: 4, padding: 0,
      }}>
        {expanded ? <IconChevUp size={12} /> : <IconChevDown size={12} />}
        {expanded ? "Hide details" : "Show details"}
      </button>
    </div>
  );
};

Object.assign(window, { EstimatesRail });

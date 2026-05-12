// Estimates rail — editable assumptions

const IconMap = {
  IconUsers, IconDollar, IconPercent, IconTrend, IconBolt, IconLeaf,
  IconBuilding, IconClock, IconShield,
};

const EstimatesRail = ({ assumptions, setAssumption, items, highlightedIds, selectedItemLabel, selectedItemColor, onClearSelection, onEditAssumption, readOnly, sortBySensitivity, onToggleSort }) => {
  const [expanded, setExpanded] = React.useState(null);
  const [query, setQuery] = React.useState("");
  const scrollRef = React.useRef(null);

  const highlightSet = React.useMemo(
    () => new Set(highlightedIds || []),
    [highlightedIds]
  );
  const hasHighlight = highlightSet.size > 0;

  // |∂NPV/∂x| ranking — compute the swing in NPV across each assumption's
  // sensitivity range, then sort by magnitude. Only computed when the
  // toggle is on; one computeSensitivity call covers all assumptions in
  // O(n·computeModel) so it's cheap for typical models.
  const sensitivityRanges = React.useMemo(() => {
    if (!sortBySensitivity) return null;
    const A = {};
    for (const a of assumptions) A[a.id] = a.value;
    const sens = computeSensitivity(items, A, assumptions, 0.25);
    return new Map(sens.map(s => [s.id, s.range]));
  }, [sortBySensitivity, items, assumptions]);

  // Filter by case-insensitive match on id, label, group, description
  const q = query.trim().toLowerCase();
  const matches = (a) => !q
    || a.id.toLowerCase().includes(q)
    || (a.label || "").toLowerCase().includes(q)
    || (a.group || "").toLowerCase().includes(q)
    || (a.description || "").toLowerCase().includes(q);

  const visible = assumptions.filter(matches);
  // Highlighted cards in their original ordering, then the rest:
  //   - grouped (default), OR
  //   - flat-sorted by |∂NPV/∂x| when the toggle is on
  const highlighted = visible.filter(a => highlightSet.has(a.id));
  const nonHighlighted = visible.filter(a => !highlightSet.has(a.id));
  const sortedFlat = sortBySensitivity && sensitivityRanges
    ? [...nonHighlighted].sort((a, b) =>
        (sensitivityRanges.get(b.id) || 0) - (sensitivityRanges.get(a.id) || 0))
    : null;
  const groups = {};
  if (!sortBySensitivity) {
    for (const a of nonHighlighted) {
      (groups[a.group] = groups[a.group] || []).push(a);
    }
  }
  const rangeFor = (id) => sensitivityRanges ? sensitivityRanges.get(id) : null;

  // Snap rail back to the top whenever the selection changes so the pinned
  // section is in view.
  React.useEffect(() => {
    if (hasHighlight && scrollRef.current) {
      try { scrollRef.current.scrollTo({ top: 0, behavior: "smooth" }); }
      catch { scrollRef.current.scrollTop = 0; }
    }
  }, [hasHighlight, selectedItemLabel]);

  return (
    <Card2 padding={0} style={{ borderRadius: 20, overflow: "hidden" }}>
      <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Estimates</span>
          <HelpTip topic="estimates" />
          <span style={{
            marginLeft: "auto", fontSize: 11,
            color: "var(--muted-2)", fontFamily: "var(--mono)",
          }}>{assumptions.length} variables</span>
          {onToggleSort && (
            <button onClick={onToggleSort}
              title={sortBySensitivity
                ? "Currently sorted by |∂NPV/∂x| — click to restore groups"
                : "Sort by sensitivity: |∂NPV/∂x|"}
              style={{
                border: `1px solid ${sortBySensitivity ? "var(--ink)" : "var(--line)"}`,
                background: sortBySensitivity ? "var(--ink)" : "var(--surface-2)",
                color: sortBySensitivity ? "var(--bg)" : "var(--muted)",
                padding: "3px 9px", borderRadius: 999,
                fontSize: 10.5, fontFamily: "var(--mono)",
                cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
                whiteSpace: "nowrap",
              }}>↕ impact</button>
          )}
        </div>
        <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--muted)" }}>
          {sortBySensitivity
            ? "Sorted by NPV swing. Largest |Δ NPV| first."
            : "Editable inputs that drive every cost and benefit. Click a row for context."}
        </div>
        <input type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search estimates…"
          style={{
            marginTop: 10, width: "100%", boxSizing: "border-box",
            border: "1px solid var(--line)", borderRadius: 8,
            background: "var(--surface-2)", padding: "7px 10px",
            fontSize: 12, color: "var(--ink)", outline: "none",
          }} />
      </div>

      <div ref={scrollRef} style={{
        padding: "14px 14px 0", maxHeight: "calc(100vh - 220px)", overflow: "auto",
      }}>
        {hasHighlight && (
          <div style={{ marginBottom: 10 }}>
            <div style={{
              padding: "6px 4px 8px",
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
              color: "var(--eyebrow)", fontWeight: 500,
            }}>
              <Dot2 color={selectedItemColor || "var(--ink)"} size={7} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textTransform: "none", letterSpacing: 0 }}>
                Relevant to <strong style={{ color: "var(--ink)" }}>{selectedItemLabel}</strong>
              </span>
              {onClearSelection && (
                <button onClick={onClearSelection} title="Clear selection"
                  style={{ border: "none", background: "transparent", color: "var(--muted)", cursor: "pointer", padding: 2, fontSize: 14, lineHeight: 1 }}>
                  ×
                </button>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              {highlighted.map(a => (
                <EstimateCard
                  key={a.id} a={a}
                  expanded={expanded === a.id}
                  onToggle={() => setExpanded(expanded === a.id ? null : a.id)}
                  onChange={(v) => setAssumption(a.id, v)}
                  onEdit={onEditAssumption ? () => onEditAssumption(a) : null}
                  accentColor={selectedItemColor}
                  readOnly={readOnly}
                  range={rangeFor(a.id)}
                />
              ))}
            </div>
          </div>
        )}

        {sortBySensitivity ? (
          <div style={{ marginBottom: 6 }}>
            {!hasHighlight && (
              <div style={{
                padding: "6px 4px 8px",
                fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
                color: "var(--eyebrow)", fontWeight: 500,
              }}>Ranked by NPV swing</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              {sortedFlat.map(a => (
                <EstimateCard
                  key={a.id} a={a}
                  expanded={expanded === a.id}
                  onToggle={() => setExpanded(expanded === a.id ? null : a.id)}
                  onChange={(v) => setAssumption(a.id, v)}
                  onEdit={onEditAssumption ? () => onEditAssumption(a) : null}
                  readOnly={readOnly}
                  range={rangeFor(a.id)}
                />
              ))}
            </div>
          </div>
        ) : (
          Object.entries(groups).map(([gname, gitems]) => (
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
                    onEdit={onEditAssumption ? () => onEditAssumption(a) : null}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            </div>
          ))
        )}
        {visible.length === 0 && (
          <div style={{ padding: "20px 8px", color: "var(--muted)", fontSize: 12, textAlign: "center" }}>
            No estimates match "{query}".
          </div>
        )}
      </div>

    </Card2>
  );
};

const EstimateCard = ({ a, expanded, onToggle, onChange, accentColor, onEdit, readOnly, range }) => {
  const Icn = IconMap[a.icon] || IconCube;
  const rangeText = (typeof range === "number" && range > 0) ? fmtMoney(range) : null;
  return (
    <div style={{
      border: accentColor ? `1.5px solid ${accentColor}` : "1px solid var(--line)",
      borderRadius: 14,
      padding: 12, background: "var(--surface)",
      boxShadow: accentColor ? `0 0 0 3px color-mix(in srgb, ${accentColor} 12%, transparent)` : undefined,
      transition: "border-color 120ms, box-shadow 120ms",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{
          width: 22, height: 22, borderRadius: 6,
          background: "var(--bg-soft)", border: "1px solid var(--line)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: "var(--muted)", flex: "0 0 auto",
        }}><Icn size={12} /></span>
        <span style={{ fontSize: 12.5, fontWeight: 500, flex: 1, minWidth: 0 }}>{a.label}</span>
        {rangeText ? (
          <span title="NPV swing across this estimate's sensitivity range"
            style={{
              fontSize: 10.5, fontFamily: "var(--mono)", color: "var(--muted)",
              padding: "2px 7px", borderRadius: 999,
              background: "var(--surface-2)", border: "1px solid var(--line)",
              whiteSpace: "nowrap",
            }}>±{rangeText}</span>
        ) : (
          <IconDots size={14} style={{ color: "var(--muted-2)" }} />
        )}
      </div>
      {readOnly ? (
        <div style={{
          padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8,
          background: "var(--surface-2)", fontFamily: "var(--mono)", fontSize: 13.5,
          color: "var(--ink)", display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>{a.value?.toLocaleString?.() ?? a.value}</span>
          {a.unit && <span style={{ fontSize: 11, color: "var(--muted-2)" }}>{a.unit}</span>}
        </div>
      ) : (
        <NumberInput
          value={a.value} step={a.step}
          onChange={onChange}
          unit={a.unit}
        />
      )}
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
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <button onClick={onToggle} style={{
          border: "none", background: "transparent",
          color: "var(--muted)", fontSize: 11.5,
          display: "inline-flex", alignItems: "center", gap: 4, padding: 0,
          cursor: "pointer",
        }}>
          {expanded ? <IconChevUp size={12} /> : <IconChevDown size={12} />}
          {expanded ? "Hide details" : "Show details"}
        </button>
        {expanded && onEdit && (
          <button onClick={onEdit} style={{
            border: "1px solid var(--line)", background: "var(--surface)",
            color: "var(--ink-2)", padding: "3px 8px", borderRadius: 6,
            fontSize: 11, cursor: "pointer",
          }}>Edit</button>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { EstimatesRail });

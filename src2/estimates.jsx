// Estimates rail — editable assumptions

const IconMap = {
  IconUsers, IconDollar, IconPercent, IconTrend, IconBolt, IconLeaf,
  IconBuilding, IconClock, IconShield,
};

const EstimatesRail = ({ assumptions: assumptionsAll, setAssumption, items, highlightedIds, hoveredIds, selectedItemLabel, selectedItemColor, hoveredItemColor, onClearSelection, onEditAssumption, readOnly, sortBySensitivity, onToggleSort, visibleAssumptionIds }) => {
  // Optional progressive-disclosure filter — only show assumptions used by
  // currently-visible items. discount_rate is always passed through.
  const assumptions = React.useMemo(() => {
    if (!visibleAssumptionIds || !(visibleAssumptionIds instanceof Set)) return assumptionsAll;
    return assumptionsAll.filter(a => visibleAssumptionIds.has(a.id));
  }, [assumptionsAll, visibleAssumptionIds]);
  const [expanded, setExpanded] = React.useState(null);
  const [query, setQuery] = React.useState("");
  const scrollRef = React.useRef(null);

  const highlightSet = React.useMemo(() => new Set(highlightedIds || []), [highlightedIds]);
  const hoverSet     = React.useMemo(() => new Set(hoveredIds   || []), [hoveredIds]);
  const hasHighlight = highlightSet.size > 0;

  // Stable sort: capture the impact ranking once when sort is toggled on,
  // and refresh only when structurally relevant inputs change — soft-value
  // flag, items membership, assumption membership. Value edits on existing
  // assumptions are deliberately NOT a trigger, so cards don't reshuffle
  // while the user is dragging a slider.
  // Lazy init so a page that hydrates with sortBySensitivity already true
  // doesn't render a null frozenOrder for one frame.
  const [frozenOrder, setFrozenOrder] = React.useState(() => {
    if (!sortBySensitivity) return null;
    const A = {};
    for (const a of assumptions) A[a.id] = a.value;
    return computeSensitivity(items, A, assumptions).map(s => s.id);
  });
  const itemsKey       = React.useMemo(() => items.map(i => i.id).join("|"),       [items]);
  const assumptionsKey = React.useMemo(() => assumptions.map(a => a.id).join("|"), [assumptions]);

  React.useEffect(() => {
    if (!sortBySensitivity) { setFrozenOrder(null); return; }
    const A = {};
    for (const a of assumptions) A[a.id] = a.value;
    const sens = computeSensitivity(items, A, assumptions);
    setFrozenOrder(sens.map(s => s.id));
    // Intentionally excludes `assumptions`/`items` object refs — only the
    // membership keys participate.
  }, [sortBySensitivity, itemsKey, assumptionsKey]); // eslint-disable-line

  // Filter by case-insensitive match on id, label, group, description
  const q = query.trim().toLowerCase();
  const matches = (a) => !q
    || a.id.toLowerCase().includes(q)
    || (a.label || "").toLowerCase().includes(q)
    || (a.group || "").toLowerCase().includes(q)
    || (a.description || "").toLowerCase().includes(q);

  const visible = assumptions.filter(matches);
  const highlighted    = visible.filter(a => highlightSet.has(a.id));
  const nonHighlighted = visible.filter(a => !highlightSet.has(a.id));

  // When sort is on, render in frozenOrder. Any assumption added since
  // the last rerank lands at the end until the next structural change.
  let sortedFlat = null;
  if (sortBySensitivity && frozenOrder) {
    const orderIdx = new Map(frozenOrder.map((id, i) => [id, i]));
    sortedFlat = [...nonHighlighted].sort((a, b) => {
      const ai = orderIdx.has(a.id) ? orderIdx.get(a.id) : Number.MAX_SAFE_INTEGER;
      const bi = orderIdx.has(b.id) ? orderIdx.get(b.id) : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
  }
  const groups = {};
  if (!sortBySensitivity) {
    for (const a of nonHighlighted) {
      (groups[a.group] = groups[a.group] || []).push(a);
    }
  }

  // -- FLIP animation --------------------------------------------------
  // Refs per visible card. After every render we measure each card's new
  // position; if it differs from the previously-recorded position, we
  // apply an inverse transform and then animate it back to identity. This
  // makes reorders (selecting an item, toggling sort, search filter
  // changes) feel like the cards are gliding into place.
  const cardRefs = React.useRef({});
  const prevRects = React.useRef({});
  React.useLayoutEffect(() => {
    // Preserve unmounted ids' last-known positions so a card that vanishes
    // from one parent (e.g. groups) and reappears in another (pinned) can
    // animate the move.
    const next = { ...prevRects.current };
    for (const [id, el] of Object.entries(cardRefs.current)) {
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const prev = prevRects.current[id];
      if (prev && (Math.abs(prev.top - rect.top) > 0.5 || Math.abs(prev.left - rect.left) > 0.5)) {
        const dx = prev.left - rect.left;
        const dy = prev.top  - rect.top;
        el.style.transition = "none";
        el.style.transform  = `translate(${dx}px, ${dy}px)`;
        // eslint-disable-next-line no-unused-expressions
        el.getBoundingClientRect(); // force reflow
        requestAnimationFrame(() => {
          el.style.transition = "transform 280ms var(--ease-quint)";
          el.style.transform  = "";
        });
      }
      next[id] = rect;
    }
    prevRects.current = next;
  });
  const setCardRef = (id) => (el) => {
    if (el) cardRefs.current[id] = el;
    else delete cardRefs.current[id];
    // Intentionally keep prevRects[id] across unmounts: when a card moves
    // between the pinned section and groups, the wrapper unmounts in one
    // parent and a new wrapper mounts in another. Keeping the previous
    // position around lets FLIP animate that cross-section move.
  };

  // Accent resolution per card: selected (strong) > hovered (light) > none.
  const accentFor = (id) => {
    if (highlightSet.has(id) && selectedItemColor) return { color: selectedItemColor, strong: true };
    if (hoverSet.has(id) && hoveredItemColor)     return { color: hoveredItemColor,    strong: false };
    return null;
  };

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
        </div>
        <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--muted)" }}>
          Ranked by impact on NPV. Expand a Scope to see the estimates that drive it.
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
                <div key={a.id} ref={setCardRef(a.id)} style={{ willChange: "transform" }}>
                  <EstimateCard
                    a={a}
                    expanded={expanded === a.id}
                    onToggle={() => setExpanded(expanded === a.id ? null : a.id)}
                    onChange={(v) => setAssumption(a.id, v)}
                    onEdit={onEditAssumption ? () => onEditAssumption(a) : null}
                    accent={accentFor(a.id)}
                    readOnly={readOnly}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {sortBySensitivity && sortedFlat ? (
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
                <div key={a.id} ref={setCardRef(a.id)} style={{ willChange: "transform" }}>
                  <EstimateCard
                    a={a}
                    expanded={expanded === a.id}
                    onToggle={() => setExpanded(expanded === a.id ? null : a.id)}
                    onChange={(v) => setAssumption(a.id, v)}
                    onEdit={onEditAssumption ? () => onEditAssumption(a) : null}
                    accent={accentFor(a.id)}
                    readOnly={readOnly}
                  />
                </div>
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
                  <div key={a.id} ref={setCardRef(a.id)} style={{ willChange: "transform" }}>
                    <EstimateCard
                      a={a}
                      expanded={expanded === a.id}
                      onToggle={() => setExpanded(expanded === a.id ? null : a.id)}
                      onChange={(v) => setAssumption(a.id, v)}
                      onEdit={onEditAssumption ? () => onEditAssumption(a) : null}
                      accent={accentFor(a.id)}
                      readOnly={readOnly}
                    />
                  </div>
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

const EstimateCard = ({ a, expanded, onToggle, onChange, accent, onEdit, readOnly }) => {
  const Icn = IconMap[a.icon] || IconCube;
  // accent: { color, strong } | null
  //   strong true  → selected — 1.5px border + soft halo
  //   strong false → hover preview — 1px tinted border, no halo
  const border = accent
    ? `${accent.strong ? 1.5 : 1}px solid ${accent.color}`
    : "1px solid var(--line)";
  const boxShadow = accent && accent.strong
    ? `0 0 0 3px color-mix(in srgb, ${accent.color} 12%, transparent)`
    : undefined;
  return (
    <div style={{
      border, borderRadius: 14,
      padding: 12, background: "var(--surface)",
      boxShadow,
      transition: "border-color 160ms ease, box-shadow 160ms ease",
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
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--line)" }}>
            <SourceTag source={a.source} />
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

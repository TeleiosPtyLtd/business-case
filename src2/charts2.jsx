// HoverStackedBars — same look as StackedBars, but with mouse-aware tooltip
// showing the per-item breakdown for the year under cursor.
//
// Props:
//   series: [{ key, color, name, values: [N] }]
//   height, yMax, yLabelFmt, formatValue
//   subtitle (e.g. "cash + soft")

const HoverStackedBars = ({
  series,
  width: widthProp,
  height = 280,
  yMax,
  yLabelFmt = (v) => v >= 1000 ? `$${(v/1000).toFixed(1)}M` : `$${v.toFixed(0)}k`,
  formatValue = (v) => fmtMoney(v, { precise: true }),
  onSegmentClick,
  selectedKey,
  hoveredKey,
  onSegmentHover,
}) => {
  // Measure the container so the SVG renders at its true pixel width.
  // Previously the chart used a fixed 600px viewBox with width="100%"
  // + preserveAspectRatio="none", which stretched text glyphs whenever
  // the container's aspect ratio diverged from 600x280. Text in a
  // chart must always render at its native geometry — typographic
  // integrity is non-negotiable.
  const wrapRef = React.useRef(null);
  const [measured, setMeasured] = React.useState(widthProp || 600);
  React.useLayoutEffect(() => {
    if (widthProp || !wrapRef.current) return;
    const el = wrapRef.current;
    const apply = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setMeasured(Math.max(320, Math.round(w)));
    };
    apply();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", apply);
      return () => window.removeEventListener("resize", apply);
    }
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [widthProp]);
  const width = widthProp || measured;

  const padL = 44, padR = 12, padT = 10, padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const N = series[0]?.values.length ?? 7;

  const totals = Array.from({ length: N }, (_, i) =>
    series.reduce((s, ser) => s + ser.values[i], 0)
  );
  const max = yMax ?? Math.max(...totals, 1) * 1.05;
  const ticks = 6;
  const tickStep = max / (ticks - 1);
  const slot = innerW / N;
  const barW = slot * 0.62;

  const [hoverYear, setHoverYear] = React.useState(null);

  const handleMove = (e) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xPx = e.clientX - rect.left;
    if (xPx < padL || xPx > width - padR) { setHoverYear(null); return; }
    const idx = Math.floor((xPx - padL) / slot);
    if (idx >= 0 && idx < N) setHoverYear(idx);
    else setHoverYear(null);
  };
  const handleLeave = () => setHoverYear(null);

  // Tooltip placement
  const tooltipSide = hoverYear != null && hoverYear < N / 2 ? "right" : "left";
  const hoverItems = hoverYear != null
    ? series.map(s => ({ ...s, value: s.values[hoverYear] }))
        .filter(s => s.value > 0)
        .sort((a, b) => b.value - a.value)
    : [];
  const hoverTotal = hoverYear != null ? totals[hoverYear] : 0;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}
         onMouseMove={handleMove} onMouseLeave={handleLeave}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
           style={{ display: "block" }}>
        {/* Y axis ticks + grid — solid baseline, dashed intermediate grids */}
        {Array.from({ length: ticks }).map((_, i) => {
          const v = tickStep * i;
          const y = padT + innerH - (v / max) * innerH;
          const isBaseline = i === 0;
          return (
            <g key={i}>
              <line x1={padL} x2={width - padR} y1={y} y2={y}
                    stroke={isBaseline ? "var(--ink-2)" : "var(--line)"}
                    strokeWidth={isBaseline ? 1.25 : 1}
                    strokeDasharray={isBaseline ? undefined : "1 4"}
                    shapeRendering="crispEdges" />
              <text x={padL - 8} y={y + 3} fontSize="11" fill="var(--muted-2)" textAnchor="end"
                    fontFamily="var(--mono)">{yLabelFmt(v / 1000)}</text>
            </g>
          );
        })}
        {/* Left vertical axis rule */}
        <line x1={padL} x2={padL} y1={padT} y2={padT + innerH}
              stroke="var(--ink-2)" strokeWidth="1.25"
              shapeRendering="crispEdges" />

        {/* Bars + hover-column highlight */}
        {Array.from({ length: N }).map((_, i) => {
          const cx = padL + slot * i + slot / 2;
          const x0 = padL + slot * i;
          let acc = 0;
          const isHover = hoverYear === i;
          return (
            <g key={i}>
              {isHover && (
                <rect x={x0} y={padT} width={slot} height={innerH}
                      fill="var(--ink)" opacity="0.04" />
              )}
              {/* Visible bar segments — pointer-events off so the wider
                  hit-zone overlays below catch hover/click. */}
              {series.map((ser, si) => {
                const v = ser.values[i];
                if (v <= 0) return null;
                const h = (v / max) * innerH;
                const y = padT + innerH - ((acc + v) / max) * innerH;
                acc += v;
                const isSelected = selectedKey === ser.key;
                const dimmed = hoverYear != null && !isHover;
                const isHoveredRow = hoveredKey === ser.key;
                const strokeColor = isSelected
                  ? "var(--ink)"
                  : isHoveredRow
                    ? ser.color
                    : "var(--ink-2)";
                const strokeWidth = isSelected ? 1.5 : isHoveredRow ? 1.5 : 1;
                return (
                  <rect key={ser.key} x={cx - barW/2} y={y} width={barW} height={Math.max(h, 0.5)}
                        fill={ser.color}
                        fillOpacity={dimmed && !isHoveredRow ? 0.06 : (isHoveredRow ? 0.28 : 0.14)}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        strokeOpacity={dimmed && !isHoveredRow ? 0.4 : 1}
                        shapeRendering="crispEdges"
                        pointerEvents="none" />
                );
              })}
              {/* Wide invisible hit zones — full slot width so the user
                  doesn't have to land precisely on the narrow visible bar. */}
              {(() => {
                let hitAcc = 0;
                return series.map((ser) => {
                  const v = ser.values[i];
                  if (v <= 0) return null;
                  const h = (v / max) * innerH;
                  const y = padT + innerH - ((hitAcc + v) / max) * innerH;
                  hitAcc += v;
                  return (
                    <rect key={`hit-${ser.key}`}
                          x={x0} y={y} width={slot} height={Math.max(h, 0.5)}
                          fill="transparent"
                          onMouseEnter={onSegmentHover ? () => onSegmentHover(ser.key) : undefined}
                          onMouseLeave={onSegmentHover ? () => onSegmentHover(null)     : undefined}
                          onClick={onSegmentClick ? () => onSegmentClick(ser.key) : undefined}
                          style={onSegmentClick ? { cursor: "pointer" } : undefined} />
                  );
                });
              })()}
              <text x={cx} y={height - 8} fontSize="11"
                    fill={isHover ? "var(--ink)" : "var(--muted-2)"}
                    fontFamily="var(--serif)"
                    fontWeight={isHover ? 500 : 400}
                    textAnchor="middle">
                Year {i + 1}
              </text>
            </g>
          );
        })}

        {/* Labels: faint per-segment values inside each block, and a total
            above each stack. Per-segment labels skipped when the segment
            is too short to fit text without overlapping its neighbour. */}
        {Array.from({ length: N }).map((_, i) => {
          const cx = padL + slot * i + slot / 2;
          const total = totals[i];
          if (total <= 0) return null;
          const isHover = hoverYear === i;
          const dimmed = hoverYear != null && !isHover;
          const fmt = v => v >= 1_000_000
            ? `$${(v / 1_000_000).toFixed(1)}M`
            : v >= 1000
              ? `$${Math.round(v / 1000)}k`
              : `$${Math.round(v)}`;
          let acc = 0;
          const SEG_MIN_H = 14;
          const segLabels = series.map(ser => {
            const v = ser.values[i];
            if (v <= 0) return null;
            const h = (v / max) * innerH;
            const yMid = padT + innerH - ((acc + v / 2) / max) * innerH;
            acc += v;
            if (h < SEG_MIN_H) return null;
            return (
              <text key={ser.key} x={cx} y={yMid + 3.5}
                    fontSize="10" textAnchor="middle"
                    fill="var(--ink)" fillOpacity={dimmed ? 0.18 : 0.5}
                    fontFamily="var(--mono)"
                    pointerEvents="none">
                {fmt(v)}
              </text>
            );
          });
          const yTotalTop = padT + innerH - (total / max) * innerH;
          return (
            <g key={`labels-${i}`}>
              {segLabels}
              <text x={cx} y={yTotalTop - 5}
                    fontSize="10.5" textAnchor="middle"
                    fill="var(--ink-2)" fillOpacity={dimmed ? 0.35 : 0.9}
                    fontFamily="var(--mono)" fontWeight={500}
                    pointerEvents="none">
                {fmt(total)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hoverYear != null && hoverItems.length > 0 && (
        <div style={{
          position: "absolute",
          top: 8,
          [tooltipSide]: 8,
          minWidth: 220, maxWidth: 280,
          background: "var(--surface)",
          border: "1px solid var(--line-strong)",
          borderRadius: 10,
          padding: "10px 12px",
          boxShadow: "0 12px 28px rgba(0,0,0,0.10)",
          pointerEvents: "none",
          fontSize: 12,
          zIndex: 5,
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid var(--line)",
          }}>
            <span style={{
              fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase",
              color: "var(--eyebrow)", fontWeight: 500,
            }}>Year {hoverYear + 1}</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink)", fontWeight: 600 }}>
              {formatValue(hoverTotal)}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {hoverItems.map(s => {
              const pct = hoverTotal > 0 ? (s.value / hoverTotal) * 100 : 0;
              return (
                <div key={s.key} style={{
                  display: "grid", gridTemplateColumns: "10px 1fr auto",
                  gap: 8, alignItems: "center",
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: 2, background: s.color,
                  }} />
                  <span style={{
                    fontSize: 11.5, color: "var(--ink-2)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{s.name || s.key}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
                    {formatValue(s.value)} <span style={{ color: "var(--muted-2)" }}>· {pct.toFixed(0)}%</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { HoverStackedBars });

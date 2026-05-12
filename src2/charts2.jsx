// HoverStackedBars — same look as StackedBars, but with mouse-aware tooltip
// showing the per-item breakdown for the year under cursor.
//
// Props:
//   series: [{ key, color, name, values: [N] }]
//   height, yMax, yLabelFmt, formatValue
//   subtitle (e.g. "cash + soft")

const HoverStackedBars = ({
  series,
  width = 600,
  height = 280,
  yMax,
  yLabelFmt = (v) => v >= 1000 ? `$${(v/1000).toFixed(1)}M` : `$${v.toFixed(0)}k`,
  formatValue = (v) => fmtMoney(v, { precise: true }),
  onSegmentClick,
  selectedKey,
}) => {
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
  const wrapRef = React.useRef(null);

  const handleMove = (e) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xPct = (e.clientX - rect.left) / rect.width;
    const xPx = xPct * width;
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
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img"
           preserveAspectRatio="none"
           style={{ display: "block" }}>
        {/* Y axis ticks + grid */}
        {Array.from({ length: ticks }).map((_, i) => {
          const v = tickStep * i;
          const y = padT + innerH - (v / max) * innerH;
          return (
            <g key={i}>
              <line x1={padL} x2={width - padR} y1={y} y2={y}
                    stroke={i === 0 ? "var(--line-strong)" : "var(--line)"} strokeWidth="1" />
              <text x={padL - 8} y={y + 3} fontSize="10" fill="var(--muted-2)" textAnchor="end"
                    fontFamily="var(--mono)">{yLabelFmt(v / 1000)}</text>
            </g>
          );
        })}

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
              {series.map((ser, si) => {
                const v = ser.values[i];
                if (v <= 0) return null;
                const h = (v / max) * innerH;
                const y = padT + innerH - ((acc + v) / max) * innerH;
                acc += v;
                const isTop = si === series.length - 1 ||
                  series.slice(si + 1).every(s => s.values[i] === 0);
                const isSelected = selectedKey === ser.key;
                const dimmed = hoverYear != null && !isHover;
                return (
                  <rect key={ser.key} x={cx - barW/2} y={y} width={barW} height={Math.max(h, 0.5)}
                        fill={ser.color}
                        opacity={dimmed ? 0.55 : 1}
                        stroke={isSelected ? "var(--ink)" : "none"}
                        strokeWidth={isSelected ? 1.5 : 0}
                        rx={isTop ? 3 : 0} ry={isTop ? 3 : 0}
                        style={onSegmentClick ? { cursor: "pointer" } : undefined}
                        onClick={onSegmentClick ? () => onSegmentClick(ser.key) : undefined} />
                );
              })}
              <text x={cx} y={height - 8} fontSize="10"
                    fill={isHover ? "var(--ink)" : "var(--muted-2)"}
                    fontWeight={isHover ? 600 : 400}
                    textAnchor="middle">
                Year {i + 1}
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

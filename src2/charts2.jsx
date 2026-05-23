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

// CumulativeCashflow — single-line chart for the cash-tight-customer's
// first question: when do I get my money back?
//
// Visual register matches FlowOverTime: dashed grid on --line, solid
// zero baseline on --ink-2 with crispEdges, italic serif year labels,
// no chart-chrome legend. Three on-curve dots mark the values the prose
// above the chart has just named — red trough (max out-of-pocket), ink
// payback crossing, green endpoint.
//
// The chart renders one sample per period in the case's granularity.
//
// Props:
//   periodly       — net per period, length horizon, signed
//   cumulative     — running sum, length horizon
//   paybackPeriod  — continuous 1-indexed period position of zero-crossing
//   trough         — { value, periodIdx } most-negative cumulative point
//   endingValue    — cumulative final value
//   horizon        — count of periods on the x-axis
//   granularity    — "day" | "week" | "month" | "quarter" | "year"
const CumulativeCashflow = ({
  periodly, cumulative, paybackPeriod, trough, endingValue, horizon,
  granularity = "year",
  height = 220,
}) => {
  const wrapRef = React.useRef(null);
  const [measured, setMeasured] = React.useState(640);
  React.useLayoutEffect(() => {
    if (!wrapRef.current) return;
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
  }, []);
  const width = measured;

  if (!cumulative || cumulative.length === 0) return null;

  // One sample per period; horizon = period count.
  const N = cumulative.length;
  const u = (typeof window !== "undefined" && window.periodUnit)
    ? window.periodUnit(granularity)
    : { one: "period", many: "periods", short: "P" };
  const isYearly = granularity === "year";

  const padL = 12, padR = 12, padT = 16, padB = 30;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  // Symmetric value range so the zero line sits where the data crosses it.
  // The chart never auto-pans away from zero — the reader needs the zero
  // line to be a visual anchor at a stable position.
  const yMaxData = Math.max(0, ...cumulative);
  const yMinData = Math.min(0, ...cumulative);
  const yMax = yMaxData === 0 && yMinData === 0 ? 1 : yMaxData;
  const yMin = yMinData;
  const span = (yMax - yMin) || 1;

  // X coordinate helpers. xForSample maps the i-th cumulative sample
  // onto the inner width. xForPeriodPos maps a continuous period position
  // (0..N) — used for the payback marker.
  const xForSample      = (i)  => padL + (i / N) * innerW;
  const xForPeriodPos   = (pp) => padL + (pp / N) * innerW;
  const yFor            = (v)  => padT + ((yMax - v) / span) * innerH;
  const zeroY = yFor(0);

  // Line points — starts at (0, 0), then each cumulative[i] at the end
  // of its sample window (so cumulative[0] sits at x = innerW / N).
  const points = [{ x: xForSample(0), y: zeroY }];
  for (let i = 0; i < cumulative.length; i++) {
    points.push({ x: xForSample(i + 1), y: yFor(cumulative[i]) });
  }
  const pathD = points.map((p, i) =>
    `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`
  ).join(" ");

  // Subtle area fills: red below zero, green above zero. Built as a closed
  // path along the line, then clipped against the zero axis using two
  // overlay rectangles in `mask` (white = visible, black = hidden).
  const areaD = `${pathD} L${xForSample(N).toFixed(1)},${zeroY.toFixed(1)} L${xForSample(0).toFixed(1)},${zeroY.toFixed(1)} Z`;

  const maskId = React.useMemo(
    () => `cf-mask-${Math.random().toString(36).slice(2, 8)}`,
    []
  );

  const showTrough = trough && trough.value < 0;
  const showCrossing = paybackPeriod != null && paybackPeriod > 0
    && paybackPeriod <= N && showTrough;
  const showEndpoint = endingValue !== 0 || cumulative.some(v => v !== 0);

  const troughSampleIdx = trough && (trough.periodIdx != null ? trough.periodIdx : 0);
  const troughX = showTrough ? xForSample(troughSampleIdx + 1) : 0;
  const troughY = showTrough ? yFor(trough.value) : 0;
  const crossX  = showCrossing ? xForPeriodPos(paybackPeriod) : 0;
  const endX    = xForSample(N);
  const endY    = yFor(endingValue);

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
           role="img" style={{ display: "block" }}>
        <defs>
          <mask id={`${maskId}-above`}>
            <rect x="0" y="0" width={width} height={zeroY} fill="white" />
            <rect x="0" y={zeroY} width={width} height={height - zeroY} fill="black" />
          </mask>
          <mask id={`${maskId}-below`}>
            <rect x="0" y="0" width={width} height={zeroY} fill="black" />
            <rect x="0" y={zeroY} width={width} height={height - zeroY} fill="white" />
          </mask>
        </defs>

        {/* Subtle area fills — green above zero, red below. Low opacity so
            they read as a tint, not a block. */}
        <path d={areaD} fill="var(--green-deep)" fillOpacity="0.08"
              mask={`url(#${maskId}-above)`} />
        <path d={areaD} fill="var(--red-deep)" fillOpacity="0.08"
              mask={`url(#${maskId}-below)`} />

        {/* Zero baseline — solid, crisp, matches FlowOverTime axis style. */}
        <line x1={padL} x2={width - padR} y1={zeroY} y2={zeroY}
              stroke="var(--ink-2)" strokeWidth="1.25"
              shapeRendering="crispEdges" />

        {/* Period tick lines — short, dashed, hairline at each boundary. */}
        {Array.from({ length: N - 1 }).map((_, i) => {
          const x = xForSample(i + 1);
          return (
            <line key={`tick-${i}`} x1={x} x2={x}
                  y1={padT} y2={padT + innerH}
                  stroke="var(--line)"
                  strokeWidth="1"
                  strokeDasharray="1 4"
                  shapeRendering="crispEdges" />
          );
        })}

        {/* The line itself. */}
        <path d={pathD} fill="none"
              stroke="var(--ink)" strokeWidth="1.75"
              strokeLinejoin="round" strokeLinecap="round" />

        {/* Trough — max out-of-pocket. Vertical guide from dot to axis. */}
        {showTrough && (
          <g>
            <line x1={troughX} x2={troughX} y1={troughY} y2={padT + innerH}
                  stroke="var(--red-deep)" strokeOpacity="0.32"
                  strokeWidth="1" strokeDasharray="2 3" />
            <circle cx={troughX} cy={troughY} r="4.5"
                    fill="var(--red-deep)" />
            <circle cx={troughX} cy={troughY} r="8"
                    fill="var(--red-deep)" fillOpacity="0.18" />
          </g>
        )}

        {/* Payback crossing — sits exactly on the zero line. Vertical guide
            down to the year axis emphasises which year it falls in. */}
        {showCrossing && (
          <g>
            <line x1={crossX} x2={crossX} y1={zeroY} y2={padT + innerH}
                  stroke="var(--ink)" strokeOpacity="0.3"
                  strokeWidth="1" strokeDasharray="2 3" />
            <circle cx={crossX} cy={zeroY} r="4.5"
                    fill="var(--ink)" />
            <circle cx={crossX} cy={zeroY} r="8"
                    fill="var(--ink)" fillOpacity="0.16" />
          </g>
        )}

        {/* Endpoint — final cumulative value at end of horizon. */}
        {showEndpoint && (
          <g>
            <circle cx={endX} cy={endY} r="4.5"
                    fill={endingValue >= 0 ? "var(--green-deep)" : "var(--red-deep)"} />
            <circle cx={endX} cy={endY} r="8"
                    fill={endingValue >= 0 ? "var(--green-deep)" : "var(--red-deep)"}
                    fillOpacity="0.18" />
          </g>
        )}

        {/* Timeline labels — italic serif var(--muted), centered under
            each period. Yearly cases keep the full "Year N" form; all
            other granularities use a short prefix (Q1, M1, W1, D1). */}
        {Array.from({ length: N }).map((_, i) => {
          const cx = xForSample(i + 0.5);
          const isPayback = showCrossing
            && paybackPeriod > i && paybackPeriod <= i + 1;
          const label = isYearly ? `Year ${i + 1}` : `${u.short}${i + 1}`;
          const density = N > 12 ? "11" : (N > 6 ? "12" : "14");
          return (
            <text key={`per-${i}`} x={cx} y={height - 10}
                  fontSize={density}
                  fontStyle="italic"
                  fontFamily="var(--serif)"
                  textAnchor="middle"
                  fill={isPayback ? "var(--ink)" : "var(--muted)"}
                  fontWeight={isPayback ? 500 : 400}
                  letterSpacing="-0.005em">
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
};

Object.assign(window, { HoverStackedBars, CumulativeCashflow });

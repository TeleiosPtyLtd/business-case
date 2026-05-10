// Charts: stacked bar charts (costs / benefits), bar widths, ticks
// Data is per-year [10 entries]; series = [{ key, color, values: [10] }]

const StackedBars = ({ series, width = 600, height = 280, yMax, yLabelFmt = (v) => `$${v.toFixed(1)}k` }) => {
  const padL = 44, padR = 12, padT = 10, padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const N = series[0]?.values.length ?? 10;
  const totals = Array.from({ length: N }, (_, i) =>
    series.reduce((s, ser) => s + ser.values[i], 0)
  );
  const max = yMax ?? Math.max(...totals) * 1.05;
  const ticks = 6;
  const tickStep = max / (ticks - 1);
  const barW = innerW / N * 0.62;
  const slot = innerW / N;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img">
      {/* Y axis ticks + grid */}
      {Array.from({ length: ticks }).map((_, i) => {
        const v = tickStep * i;
        const y = padT + innerH - (v / max) * innerH;
        return (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={y} y2={y}
                  stroke={i === 0 ? "#D6CFB9" : "#ECE8DC"} strokeWidth="1" />
            <text x={padL - 8} y={y + 3} fontSize="10" fill="#948E7A" textAnchor="end"
                  fontFamily="var(--mono)">{yLabelFmt(v / 1000)}</text>
          </g>
        );
      })}
      {/* Bars */}
      {Array.from({ length: N }).map((_, i) => {
        const cx = padL + slot * i + slot / 2;
        let acc = 0;
        return (
          <g key={i}>
            {series.map((ser, si) => {
              const v = ser.values[i];
              if (v <= 0) return null;
              const h = (v / max) * innerH;
              const y = padT + innerH - ((acc + v) / max) * innerH;
              acc += v;
              const isTop = si === series.length - 1 ||
                series.slice(si + 1).every(s => s.values[i] === 0);
              const isBot = si === 0 || series.slice(0, si).every(s => s.values[i] === 0);
              return (
                <rect key={ser.key} x={cx - barW/2} y={y} width={barW} height={Math.max(h, 0.5)}
                      fill={ser.color}
                      rx={isTop ? 3 : 0} ry={isTop ? 3 : 0}
                />
              );
            })}
            <text x={cx} y={height - 8} fontSize="10" fill="#948E7A" textAnchor="middle">
              Year {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

// Tiny inline sparkline (NPV waterfall preview)
const SparkBar = ({ values, color = "var(--green)", w = 80, h = 24 }) => {
  const max = Math.max(...values);
  const bw = w / values.length;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {values.map((v, i) => {
        const bh = (v / max) * (h - 2);
        return <rect key={i} x={i * bw + 1} y={h - bh} width={bw - 2} height={bh}
                     fill={color} rx="1" />;
      })}
    </svg>
  );
};

Object.assign(window, { StackedBars, SparkBar });

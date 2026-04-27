import React, { useMemo, useRef, useState } from "react";

/**
 * Inline-SVG line chart. No dependencies.
 *
 * Props:
 *   series: Array<{ label: string, color: string, data: Array<{t: Date|number, v: number}> }>
 *   height?: number      (default 180)
 *   yLabel?: string
 *   yUnit?: string
 *   yMin?: number        (default: auto)
 *   yMax?: number        (default: auto)
 *   showLegend?: boolean (default true if series.length > 1)
 *   formatValue?: (n) => string
 */
export default function LineChart({
  series = [],
  height = 180,
  yLabel = "",
  yUnit = "",
  yMin: yMinProp,
  yMax: yMaxProp,
  showLegend,
  formatValue,
}) {
  const containerRef = useRef(null);
  const [hover, setHover] = useState(null); // { idx, sx }
  const [width, setWidth] = useState(640);

  // Track container width for responsiveness
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.max(280, Math.floor(entry.contentRect.width));
      setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fmt = formatValue || ((n) => (n == null ? "—" : Number(n).toFixed(2)));

  // Filter to non-empty series
  const valid = useMemo(
    () => series.filter((s) => Array.isArray(s.data) && s.data.length > 0),
    [series]
  );

  const allPoints = useMemo(
    () => valid.flatMap((s) => s.data.map((d) => ({ ...d, label: s.label }))),
    [valid]
  );

  const padding = { top: 16, right: 16, bottom: 28, left: 44 };
  const innerW = Math.max(10, width - padding.left - padding.right);
  const innerH = Math.max(10, height - padding.top - padding.bottom);

  // X domain: use timestamps as numbers
  const xs = allPoints.map((p) => +p.t);
  const xMin = xs.length ? Math.min(...xs) : 0;
  const xMax = xs.length ? Math.max(...xs) : 1;
  const xSpan = xMax - xMin || 1;

  // Y domain: auto-scale unless caller pinned it
  const vs = allPoints.map((p) => Number(p.v)).filter((n) => Number.isFinite(n));
  const dataMin = vs.length ? Math.min(...vs) : 0;
  const dataMax = vs.length ? Math.max(...vs) : 1;
  const pad = (dataMax - dataMin) * 0.08 || 1;
  const yMin = yMinProp != null ? yMinProp : dataMin - pad;
  const yMax = yMaxProp != null ? yMaxProp : dataMax + pad;
  const ySpan = yMax - yMin || 1;

  function xPx(t) {
    return padding.left + ((+t - xMin) / xSpan) * innerW;
  }
  function yPx(v) {
    return padding.top + (1 - (v - yMin) / ySpan) * innerH;
  }

  // Y-axis ticks (5)
  const yTicks = useMemo(() => {
    const out = [];
    for (let i = 0; i <= 4; i++) {
      out.push(yMin + (ySpan * i) / 4);
    }
    return out;
  }, [yMin, ySpan]);

  // X-axis ticks (start, mid, end)
  const xTicks = useMemo(() => {
    if (!xs.length) return [];
    const ticks = [xMin, (xMin + xMax) / 2, xMax];
    return ticks.map((t) => new Date(t));
  }, [xMin, xMax, xs.length]);

  function fmtTime(d) {
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  // Build series paths
  const paths = useMemo(() => {
    return valid.map((s) => {
      const pts = s.data
        .map((d) => ({ x: xPx(d.t), y: yPx(d.v) }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (pts.length === 0) return { ...s, line: "", area: "" };
      const line = pts
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(" ");
      const area =
        line +
        ` L ${pts[pts.length - 1].x.toFixed(1)} ${(padding.top + innerH).toFixed(1)}` +
        ` L ${pts[0].x.toFixed(1)} ${(padding.top + innerH).toFixed(1)} Z`;
      return { ...s, line, area, last: pts[pts.length - 1] };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, xMin, xMax, yMin, yMax, width, height]);

  // Hover handler — find nearest point on first series
  function onMove(e) {
    if (!valid.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    if (sx < padding.left || sx > padding.left + innerW) {
      setHover(null);
      return;
    }
    // Map sx → index of nearest point in series[0]
    const data = valid[0].data;
    let bestIdx = 0;
    let bestDx = Infinity;
    for (let i = 0; i < data.length; i++) {
      const px = xPx(data[i].t);
      const dx = Math.abs(px - sx);
      if (dx < bestDx) {
        bestDx = dx;
        bestIdx = i;
      }
    }
    setHover({ idx: bestIdx, sx: xPx(data[bestIdx].t) });
  }

  const showLegendResolved =
    typeof showLegend === "boolean" ? showLegend : valid.length > 1;

  if (allPoints.length === 0) {
    return (
      <div
        ref={containerRef}
        className="chartEmpty"
        style={{ height }}
      >
        No data to chart.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="chartWrap" style={{ width: "100%" }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="chartSvg"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={yLabel || "Trend chart"}
      >
        <defs>
          {paths.map((s, i) => (
            <linearGradient
              key={`g-${i}`}
              id={`chartGrad-${i}-${s.label.replace(/\W/g, "")}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {/* Y gridlines + labels */}
        {yTicks.map((t, i) => {
          const y = yPx(t);
          return (
            <g key={`y-${i}`}>
              <line
                x1={padding.left}
                x2={padding.left + innerW}
                y1={y}
                y2={y}
                className="chartGridLine"
              />
              <text x={padding.left - 8} y={y + 3} className="chartAxisLabel" textAnchor="end">
                {fmt(t)}
              </text>
            </g>
          );
        })}

        {/* X axis ticks */}
        {xTicks.map((d, i) => {
          const x = xPx(+d);
          return (
            <text
              key={`x-${i}`}
              x={x}
              y={height - 8}
              className="chartAxisLabel"
              textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
            >
              {fmtTime(d)}
            </text>
          );
        })}

        {/* Areas */}
        {paths.map((s, i) => (
          <path
            key={`a-${i}`}
            d={s.area}
            fill={`url(#chartGrad-${i}-${s.label.replace(/\W/g, "")})`}
            stroke="none"
          />
        ))}

        {/* Lines */}
        {paths.map((s, i) => (
          <path
            key={`l-${i}`}
            d={s.line}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Last-point markers */}
        {paths.map((s, i) =>
          s.last ? (
            <circle
              key={`p-${i}`}
              cx={s.last.x}
              cy={s.last.y}
              r="3.5"
              fill={s.color}
              stroke="#fff"
              strokeWidth="2"
            />
          ) : null
        )}

        {/* Hover guide */}
        {hover && (
          <g pointerEvents="none">
            <line
              x1={hover.sx}
              x2={hover.sx}
              y1={padding.top}
              y2={padding.top + innerH}
              className="chartHoverLine"
            />
            {valid.map((s, i) => {
              const d = s.data[hover.idx];
              if (!d || !Number.isFinite(Number(d.v))) return null;
              return (
                <circle
                  key={`hp-${i}`}
                  cx={xPx(d.t)}
                  cy={yPx(d.v)}
                  r="4"
                  fill={s.color}
                  stroke="#fff"
                  strokeWidth="2"
                />
              );
            })}
          </g>
        )}
      </svg>

      {/* Tooltip */}
      {hover && (
        <div
          className="chartTooltip"
          style={{
            left: Math.min(width - 180, Math.max(0, hover.sx - 90)),
          }}
        >
          <div className="chartTooltipTime">
            {new Date(valid[0].data[hover.idx].t).toLocaleString()}
          </div>
          {valid.map((s) => {
            const d = s.data[hover.idx];
            return (
              <div key={s.label} className="chartTooltipRow">
                <span
                  className="chartSwatch"
                  style={{ background: s.color }}
                  aria-hidden="true"
                />
                <span className="chartTooltipLabel">{s.label}</span>
                <span className="chartTooltipValue">
                  {fmt(d?.v)}
                  {yUnit ? ` ${yUnit}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      {showLegendResolved && (
        <div className="chartLegend">
          {valid.map((s) => (
            <span key={s.label} className="chartLegendItem">
              <span
                className="chartSwatch"
                style={{ background: s.color }}
                aria-hidden="true"
              />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

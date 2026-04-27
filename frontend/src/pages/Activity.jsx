import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icons.jsx";
import LineChart from "../components/LineChart.jsx";

const API_BASE = "http://127.0.0.1:8001";

function pct(n, digits = 1) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

function classifyByThreshold(prob, threshold) {
  if (prob == null) return "—";
  return prob >= threshold ? "At Risk" : "OK";
}

function bucketByProb(prob) {
  if (prob == null) return "Unknown";
  if (prob >= 0.85) return "Critical";
  if (prob >= 0.6) return "High";
  if (prob >= 0.3) return "Medium";
  return "Low";
}

function bucketPillClass(b) {
  if (b === "Critical") return "pill pill-critical";
  if (b === "High" || b === "Medium") return "pill pill-warn";
  if (b === "Low") return "pill pill-ok";
  return "pill pill-muted";
}

const READING_LIMIT = 80; // chart points cap

export default function Activity() {
  const [sensors, setSensors] = useState([]);
  const [predictions, setPredictions] = useState({}); // { sensor_code: {probability, prediction, timestamp} | null }
  const [meta, setMeta] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedCode, setSelectedCode] = useState("");
  const [readings, setReadings] = useState([]);
  const [readingsLoading, setReadingsLoading] = useState(false);
  const [readingsError, setReadingsError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [sRes, mRes] = await Promise.all([
        fetch(`${API_BASE}/api/sensor-submissions/`),
        fetch(`${API_BASE}/corrosion/metadata`),
      ]);
      if (!sRes.ok) throw new Error(`Failed to load sensors (HTTP ${sRes.status})`);
      const sList = await sRes.json();
      const list = Array.isArray(sList) ? sList : [];
      setSensors(list);

      if (mRes.ok) {
        try {
          setMeta(await mRes.json());
        } catch {
          setMeta(null);
        }
      } else {
        setMeta(null);
      }

      // Fetch predictions in parallel
      const preds = await Promise.all(
        list.map(async (s) => {
          try {
            const r = await fetch(
              `${API_BASE}/corrosion/predict/${encodeURIComponent(s.sensor_code)}`
            );
            if (!r.ok) return [s.sensor_code, null];
            return [s.sensor_code, await r.json()];
          } catch {
            return [s.sensor_code, null];
          }
        })
      );
      setPredictions(Object.fromEntries(preds));

      // Pick a default sensor for the trend chart
      if (list.length && !selectedCode) {
        // Prefer the first sensor that has a successful prediction
        const firstWithPred = list.find(
          (s) =>
            preds.find(([code]) => code === s.sensor_code)?.[1]?.probability !=
            null
        );
        setSelectedCode((firstWithPred || list[0]).sensor_code);
      }
    } catch (e) {
      setError(e.message || "Failed to load activity");
    } finally {
      setLoading(false);
    }
  }, [selectedCode]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load readings whenever the selected sensor changes
  useEffect(() => {
    if (!selectedCode) return;
    let cancelled = false;
    (async () => {
      setReadingsLoading(true);
      setReadingsError("");
      try {
        const res = await fetch(
          `${API_BASE}/sensor-readings/${encodeURIComponent(selectedCode)}`
        );
        if (!res.ok) {
          if (res.status === 404) throw new Error("No readings for this sensor.");
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        // API returns DESC by timestamp; we want oldest → newest for charting,
        // and we cap to the most recent N points.
        const sortedAsc = [...(Array.isArray(data) ? data : [])]
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const recent = sortedAsc.slice(-READING_LIMIT);
        if (!cancelled) setReadings(recent);
      } catch (e) {
        if (!cancelled) {
          setReadings([]);
          setReadingsError(e.message || "Failed to load readings");
        }
      } finally {
        if (!cancelled) setReadingsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCode]);

  const threshold = meta?.decision_threshold ?? 0.5;
  const features = meta?.features || [];
  const extraMeta = useMemo(() => {
    if (!meta) return [];
    const skip = new Set(["features", "decision_threshold"]);
    return Object.entries(meta).filter(([k]) => !skip.has(k));
  }, [meta]);

  // Split metadata into primitives (compact grid) vs. complex (own subsection)
  const simpleMeta = useMemo(
    () => extraMeta.filter(([, v]) => isPrimitive(v)),
    [extraMeta]
  );
  const complexMeta = useMemo(
    () => extraMeta.filter(([, v]) => !isPrimitive(v)),
    [extraMeta]
  );

  // KPIs
  const kpis = useMemo(() => {
    const codes = sensors.map((s) => s.sensor_code);
    const preds = codes
      .map((c) => predictions[c])
      .filter((p) => p && p.probability != null);
    const total = sensors.length;
    const withPred = preds.length;
    const critical = preds.filter((p) => p.probability >= 0.85).length;
    const avg = withPred
      ? preds.reduce((s, p) => s + p.probability, 0) / withPred
      : null;
    const flagged = preds.filter((p) => p.probability >= threshold).length;
    return { total, withPred, critical, avg, flagged };
  }, [sensors, predictions, threshold]);

  // Predictions table data
  const predictionRows = useMemo(() => {
    return sensors
      .map((s) => {
        const p = predictions[s.sensor_code];
        return {
          code: s.sensor_code,
          name: s.name,
          location: s.location,
          probability: p?.probability ?? null,
          prediction: p?.prediction ?? null,
          timestamp: p?.timestamp ?? null,
          available: !!p,
        };
      })
      .sort((a, b) => {
        // Available preds first, then descending probability, then alpha
        if (a.available !== b.available) return a.available ? -1 : 1;
        if (a.probability != null && b.probability != null) {
          return b.probability - a.probability;
        }
        return a.name.localeCompare(b.name);
      });
  }, [sensors, predictions]);

  // Chart series
  const tempSeries = useMemo(
    () => [
      {
        label: "Temperature",
        color: "#ef4444",
        data: readings.map((r) => ({
          t: new Date(r.timestamp),
          v: r.temp_c,
        })),
      },
    ],
    [readings]
  );
  const rhSeries = useMemo(
    () => [
      {
        label: "Humidity",
        color: "#3b82f6",
        data: readings.map((r) => ({
          t: new Date(r.timestamp),
          v: r.rh_percent,
        })),
      },
    ],
    [readings]
  );
  const pressureSeries = useMemo(
    () => [
      {
        label: "Pressure",
        color: "#8b5cf6",
        data: readings.map((r) => ({
          t: new Date(r.timestamp),
          v: r.pressure_iwg,
        })),
      },
    ],
    [readings]
  );
  const corrosionSeries = useMemo(
    () => [
      {
        label: "Cu cumulative",
        color: "#f59e0b",
        data: readings
          .filter((r) => r.cu_cum_A != null)
          .map((r) => ({ t: new Date(r.timestamp), v: r.cu_cum_A })),
      },
      {
        label: "Ag cumulative",
        color: "#06b6d4",
        data: readings
          .filter((r) => r.ag_cum_A != null)
          .map((r) => ({ t: new Date(r.timestamp), v: r.ag_cum_A })),
      },
    ],
    [readings]
  );

  const selectedSensor = sensors.find((s) => s.sensor_code === selectedCode);
  const selectedPrediction = predictions[selectedCode] || null;

  return (
    <>
      <header className="topbar">
        <div>
          <div className="crumbs">Activity / Model Insights</div>
          <h1 className="title">Recent Activity & Predictions</h1>
        </div>
        <div className="topbarRight">
          <button
            className="btnGhost"
            type="button"
            onClick={load}
            disabled={loading}
            title="Refresh"
          >
            {loading ? (
              <span className="spinner spinnerDark" aria-hidden="true" />
            ) : (
              <Icon.Refresh />
            )}
            <span>{loading ? "Loading" : "Refresh"}</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="errorBanner" role="alert">
          <Icon.AlertCircle />
          <span>
            <b>Couldn't load activity.</b> {error}
          </span>
        </div>
      )}

      {/* KPI strip */}
      <section className="kpis" aria-label="Activity KPIs">
        <div className="card kpi">
          <div className="kpiLabel">Sensors with Predictions</div>
          <div className="kpiValue">
            {loading ? (
              <span className="skeleton" style={{ display: "inline-block", width: 48, height: 24 }} />
            ) : (
              `${kpis.withPred} / ${kpis.total}`
            )}
          </div>
        </div>
        <div className="card kpi kpi-critical">
          <div className="kpiLabel">Critical (≥ 85%)</div>
          <div className="kpiValue">{loading ? "…" : kpis.critical}</div>
        </div>
        <div className="card kpi kpi-warn">
          <div className="kpiLabel">Above Threshold</div>
          <div className="kpiValue">{loading ? "…" : kpis.flagged}</div>
        </div>
        <div className="card kpi kpi-ok">
          <div className="kpiLabel">Avg Probability</div>
          <div className="kpiValue">{loading ? "…" : pct(kpis.avg)}</div>
        </div>
        <div className="card kpi">
          <div className="kpiLabel">Decision Threshold</div>
          <div className="kpiValue">{loading ? "…" : pct(threshold, 0)}</div>
        </div>
      </section>

      {/* Model info */}
      <section className="card" aria-label="Model info">
        <div className="cardHeader">
          <h2 className="cardTitle">
            <Icon.Activity />
            Model Info
          </h2>
          <span className="muted">
            {features.length
              ? `${features.length} feature${features.length === 1 ? "" : "s"}`
              : ""}
          </span>
        </div>
        {features.length === 0 && !loading ? (
          <div className="muted">Model metadata unavailable.</div>
        ) : (
          <>
            <div className="featureChips">
              {features.map((f) => (
                <span key={f} className="featureChip">
                  {f}
                </span>
              ))}
            </div>

            {simpleMeta.length > 0 && (
              <div className="detailGrid" style={{ marginTop: 14 }}>
                {simpleMeta.map(([k, v]) => (
                  <div className="detailField" key={k}>
                    <div className="metaLabel">{humanize(k)}</div>
                    <div className="metaValue">{renderPrimitive(v)}</div>
                  </div>
                ))}
              </div>
            )}

            {complexMeta.map(([k, v]) => (
              <div className="metaSection" key={k}>
                <div className="metaSectionLabel">{humanize(k)}</div>
                <ComplexValue value={v} />
              </div>
            ))}
          </>
        )}
      </section>

      {/* Predictions */}
      <section className="card" aria-label="Predictions">
        <div className="cardHeader">
          <h2 className="cardTitle">
            <Icon.AlertCircle />
            Current Predictions
          </h2>
          <span className="muted">
            {kpis.withPred} of {kpis.total} sensors
          </span>
        </div>

        {loading ? (
          <>
            <div className="skeleton" style={{ height: 36, marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 36, marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 36 }} />
          </>
        ) : predictionRows.length === 0 ? (
          <div className="emptyState">
            <Icon.Inbox />
            <div className="emptyStateTitle">No sensors yet</div>
            <div className="emptyStateText">Add a sensor to start seeing predictions.</div>
          </div>
        ) : (
          <div className="predTable">
            <div className="predTableHead">
              <span>Sensor</span>
              <span>Probability</span>
              <span>Bucket</span>
              <span>Threshold ({pct(threshold, 0)})</span>
              <span>Predicted</span>
              <span></span>
            </div>
            {predictionRows.map((r) => {
              const bucket = bucketByProb(r.probability);
              return (
                <Link
                  key={r.code}
                  to={`/sensors/${encodeURIComponent(r.code)}`}
                  className="predTableRow"
                >
                  <div className="predCell">
                    <div className="sensorRowName">{r.name}</div>
                    <div className="sensorRowMeta">
                      <span className="sensorRowCode" style={{ marginLeft: 0 }}>
                        {r.code}
                      </span>
                      {r.location ? (
                        <span className="muted"> · {r.location}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="predCell">
                    {r.probability != null ? (
                      <ProbBar value={r.probability} threshold={threshold} />
                    ) : (
                      <span className="muted">unavailable</span>
                    )}
                  </div>
                  <div className="predCell">
                    <span className={bucketPillClass(bucket)}>{bucket}</span>
                  </div>
                  <div className="predCell">
                    <span
                      className={
                        "pill " +
                        (r.prediction === 1
                          ? "pill-critical"
                          : r.prediction === 0
                            ? "pill-ok"
                            : "pill-muted")
                      }
                    >
                      {r.probability == null
                        ? "—"
                        : classifyByThreshold(r.probability, threshold)}
                    </span>
                  </div>
                  <div className="predCell">
                    <div className="muted">
                      {r.timestamp
                        ? new Date(r.timestamp).toLocaleString()
                        : "—"}
                    </div>
                  </div>
                  <div className="predCell" style={{ justifySelf: "end" }}>
                    <Icon.ChevronRight
                      width={16}
                      height={16}
                      style={{ color: "var(--muted)" }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Trend charts */}
      <section className="card" aria-label="Trends">
        <div className="cardHeader">
          <h2 className="cardTitle">
            <Icon.Activity />
            Trends
          </h2>
          <select
            className="select"
            value={selectedCode}
            onChange={(e) => setSelectedCode(e.target.value)}
            disabled={loading || sensors.length === 0}
            aria-label="Select sensor for trend"
          >
            {sensors.length === 0 ? (
              <option>No sensors</option>
            ) : (
              sensors.map((s) => (
                <option key={s.sensor_code} value={s.sensor_code}>
                  {s.name} ({s.sensor_code})
                </option>
              ))
            )}
          </select>
        </div>

        {selectedSensor && (
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 14,
              fontSize: 13,
              color: "var(--text-2)",
            }}
          >
            <span>
              <Icon.MapPin
                width={14}
                height={14}
                style={{ verticalAlign: "-2px", marginRight: 4, color: "var(--muted)" }}
              />
              {selectedSensor.location || "—"}
            </span>
            <span className="muted">·</span>
            <span>
              {readings.length} reading{readings.length === 1 ? "" : "s"} (latest{" "}
              {READING_LIMIT})
            </span>
            {selectedPrediction?.probability != null && (
              <>
                <span className="muted">·</span>
                <span>
                  Latest probability:{" "}
                  <b>{pct(selectedPrediction.probability)}</b>{" "}
                  <span
                    className={bucketPillClass(
                      bucketByProb(selectedPrediction.probability)
                    )}
                  >
                    {bucketByProb(selectedPrediction.probability)}
                  </span>
                </span>
              </>
            )}
          </div>
        )}

        {readingsLoading ? (
          <div className="skeleton" style={{ height: 180 }} />
        ) : readingsError ? (
          <div className="errorBanner" role="alert">
            <Icon.AlertCircle />
            <span>{readingsError}</span>
          </div>
        ) : readings.length === 0 ? (
          <div className="emptyState">
            <Icon.Inbox />
            <div className="emptyStateTitle">No readings yet</div>
            <div className="emptyStateText">
              Run the live update script to seed some readings.
            </div>
          </div>
        ) : (
          <div className="chartGrid">
            <div className="chartCell">
              <div className="chartHeader">
                <span className="chartLabel">Temperature</span>
                <span className="chartUnit">°C</span>
              </div>
              <LineChart
                series={tempSeries}
                yUnit="°C"
                formatValue={(n) => Number(n).toFixed(1)}
              />
            </div>
            <div className="chartCell">
              <div className="chartHeader">
                <span className="chartLabel">Humidity</span>
                <span className="chartUnit">%RH</span>
              </div>
              <LineChart
                series={rhSeries}
                yUnit="%"
                formatValue={(n) => Number(n).toFixed(1)}
              />
            </div>
            <div className="chartCell">
              <div className="chartHeader">
                <span className="chartLabel">Pressure</span>
                <span className="chartUnit">in. WG</span>
              </div>
              <LineChart
                series={pressureSeries}
                yUnit=" in.WG"
                formatValue={(n) => Number(n).toFixed(3)}
              />
            </div>
            <div className="chartCell chartCellWide">
              <div className="chartHeader">
                <span className="chartLabel">Cumulative Corrosion</span>
                <span className="chartUnit">Å</span>
              </div>
              <LineChart
                series={corrosionSeries}
                yUnit="Å"
                formatValue={(n) => Number(n).toFixed(2)}
                height={220}
              />
            </div>
          </div>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------
// Metadata rendering helpers
// ---------------------------------------------------------------

function isPrimitive(v) {
  return v == null || ["string", "number", "boolean"].includes(typeof v);
}

function humanize(key) {
  return String(key)
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function renderPrimitive(v) {
  if (v == null) return <span className="muted">—</span>;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return v.toLocaleString();
    // Trim trailing zeros from up-to-4-decimal float
    return Number(v.toFixed(4)).toString();
  }
  return String(v);
}

function ComplexValue({ value }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="muted">(empty)</span>;

    // Array of primitives → chip list
    if (value.every(isPrimitive)) {
      return (
        <div className="featureChips">
          {value.map((v, i) => (
            <span key={i} className="featureChip">
              {String(v)}
            </span>
          ))}
        </div>
      );
    }

    // Array of objects with consistent shape → table
    if (
      value.every(
        (v) => v && typeof v === "object" && !Array.isArray(v)
      )
    ) {
      const cols = Array.from(
        value.reduce((set, row) => {
          Object.keys(row).forEach((k) => set.add(k));
          return set;
        }, new Set())
      );
      return <MetaTable rows={value} columns={cols} />;
    }

    // Mixed array — fall back to a compact chip list with primitive coercion
    return (
      <div className="featureChips">
        {value.slice(0, 30).map((v, i) => (
          <span key={i} className="featureChip">
            {isPrimitive(v) ? String(v) : `[${typeof v}]`}
          </span>
        ))}
        {value.length > 30 && (
          <span className="muted">+ {value.length - 30} more</span>
        )}
      </div>
    );
  }

  // Object → key/value list
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return <span className="muted">(empty)</span>;
    return (
      <div className="metaKV">
        {entries.map(([k, v]) => (
          <React.Fragment key={k}>
            <div className="metaKVKey">{humanize(k)}</div>
            <div className="metaKVValue">
              {isPrimitive(v) ? renderPrimitive(v) : <ComplexValue value={v} />}
            </div>
          </React.Fragment>
        ))}
      </div>
    );
  }

  return <span>{String(value)}</span>;
}

function MetaTable({ rows, columns }) {
  const LIMIT = 12;
  const shown = rows.slice(0, LIMIT);
  return (
    <div>
      <div className="metaTableWrap">
        <table className="metaTable">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{humanize(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c}>{renderPrimitive(row[c])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > LIMIT && (
        <div className="muted" style={{ padding: "6px 4px 0", fontSize: 12 }}>
          + {rows.length - LIMIT} more {rows.length - LIMIT === 1 ? "row" : "rows"}
        </div>
      )}
    </div>
  );
}

/** A small horizontal bar showing prob with threshold marker. */
function ProbBar({ value, threshold }) {
  const pctVal = Math.max(0, Math.min(1, value)) * 100;
  const tx = Math.max(0, Math.min(100, threshold * 100));
  const above = value >= threshold;
  return (
    <div className="probBarWrap" title={`${pct(value)} (threshold ${pct(threshold, 0)})`}>
      <div className="probBarTrack">
        <div
          className={"probBarFill " + (above ? "probBarFillAbove" : "probBarFillBelow")}
          style={{ width: `${pctVal}%` }}
        />
        <div className="probBarThresh" style={{ left: `${tx}%` }} />
      </div>
      <span className="probBarText">{pct(value)}</span>
    </div>
  );
}

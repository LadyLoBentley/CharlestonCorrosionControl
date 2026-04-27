import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icons.jsx";

const API_BASE = "http://127.0.0.1:8001";
const STALE_MINUTES = 60;

function normStatus(s) {
  return (s || "").toUpperCase();
}

function minutesSince(dtStr) {
  if (!dtStr) return null;
  const dt = new Date(dtStr);
  const diffMs = Date.now() - dt.getTime();
  return Math.floor(diffMs / 60000);
}

function formatLastSeen(dtStr) {
  if (!dtStr) return "Never";
  const mins = minutesSince(dtStr);
  if (mins === null) return "Never";
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function getRiskLevelFromPrediction(sensor, predictionData) {
  const status = normStatus(sensor.status);

  if (status === "OFFLINE") return "Critical";

  const prob = predictionData?.probability;

  if (prob == null) {
    if (status === "WARNING") return "High";

    const mins = minutesSince(sensor.last_seen_at);
    if (mins !== null && mins >= STALE_MINUTES) return "Medium";

    return "Low";
  }

  if (prob >= 0.85) return "Critical";
  if (prob >= 0.6) return "High";
  if (prob >= 0.3) return "Medium";
  return "Low";
}

function toneFor(risk, status) {
  if (normStatus(status) === "OFFLINE") return "offline";
  if (risk === "Critical") return "critical";
  if (risk === "High" || risk === "Medium") return "warn";
  return "ok";
}

function ThumbIcon({ tone }) {
  if (tone === "critical")
    return (
      <div className="thumb thumb-critical">
        <Icon.AlertTriangle />
      </div>
    );
  if (tone === "warn")
    return (
      <div className="thumb thumb-warn">
        <Icon.AlertCircle />
      </div>
    );
  if (tone === "offline")
    return (
      <div className="thumb thumb-offline">
        <Icon.WifiOff />
      </div>
    );
  return (
    <div className="thumb thumb-ok">
      <Icon.CheckCircle />
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="inspection" aria-hidden="true">
      <div className="skeleton" style={{ width: 56, height: 56, borderRadius: 12 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="skeleton" style={{ height: 14, width: "40%" }} />
        <div className="skeleton" style={{ height: 12, width: "70%" }} />
      </div>
      <div className="skeleton" style={{ width: 70, height: 28, borderRadius: 8 }} />
    </div>
  );
}

export default function Dashboard() {
  const [assetFilter, setAssetFilter] = useState("All Sensors");
  const [riskFilter, setRiskFilter] = useState("All Risk Levels");
  const [role, setRole] = useState("Admin");

  const [sensors, setSensors] = useState([]);
  const [predictionsBySensor, setPredictionsBySensor] = useState({});

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const loadPredictions = useCallback(async (sensorList) => {
    try {
      const results = await Promise.all(
        sensorList.map(async (sensor) => {
          try {
            const res = await fetch(
              `${API_BASE}/corrosion/predict/${encodeURIComponent(sensor.sensor_code)}`
            );
            if (!res.ok) return [sensor.sensor_code, null];
            const data = await res.json();
            return [sensor.sensor_code, data];
          } catch {
            return [sensor.sensor_code, null];
          }
        })
      );
      setPredictionsBySensor(Object.fromEntries(results));
    } catch (e) {
      console.error("Failed to load predictions", e);
    }
  }, []);

  const loadSensors = useCallback(
    async ({ silent = false } = {}) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError("");

      try {
        const res = await fetch(`${API_BASE}/api/sensor-submissions/`);
        if (!res.ok) throw new Error(`Failed to load sensors (HTTP ${res.status})`);

        const data = await res.json();
        const sensorList = Array.isArray(data) ? data : [];

        setSensors(sensorList);
        await loadPredictions(sensorList);
      } catch (e) {
        setError(e.message || "Failed to load sensors");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadPredictions]
  );

  useEffect(() => {
    loadSensors();
  }, [loadSensors]);

  const sensorsWithPredictions = useMemo(() => {
    return sensors.map((sensor) => {
      const predictionData = predictionsBySensor[sensor.sensor_code] || null;
      const riskLevel = getRiskLevelFromPrediction(sensor, predictionData);
      return { ...sensor, predictionData, risk_level: riskLevel };
    });
  }, [sensors, predictionsBySensor]);

  const purposeOptions = useMemo(() => {
    const set = new Set();
    sensors.forEach((s) => {
      if (s.purpose && s.purpose.trim()) set.add(s.purpose.trim());
    });
    return ["All Sensors", ...Array.from(set).sort()];
  }, [sensors]);

  const kpis = useMemo(() => {
    const total = sensorsWithPredictions.length;
    const active = sensorsWithPredictions.filter((s) => s.is_active !== false).length;

    const online = sensorsWithPredictions.filter(
      (s) => normStatus(s.status) === "ONLINE"
    ).length;

    const warning = sensorsWithPredictions.filter(
      (s) => normStatus(s.status) === "WARNING"
    ).length;

    const offline = sensorsWithPredictions.filter(
      (s) => normStatus(s.status) === "OFFLINE"
    ).length;

    const stale = sensorsWithPredictions.filter((s) => {
      const mins = minutesSince(s.last_seen_at);
      return s.is_active !== false && mins !== null && mins >= STALE_MINUTES;
    }).length;

    return [
      { label: "Total", value: total },
      { label: "Active", value: active, accent: active > 0 ? "ok" : "" },
      { label: "Online", value: online, accent: online > 0 ? "ok" : "" },
      { label: "Warning", value: warning, accent: warning > 0 ? "warn" : "" },
      { label: "Offline", value: offline, accent: offline > 0 ? "critical" : "" },
      { label: "Stale", value: stale, accent: stale > 0 ? "warn" : "" },
    ];
  }, [sensorsWithPredictions]);

  const alerts = useMemo(() => {
    const list = [];
    sensorsWithPredictions.forEach((s) => {
      if (s.is_active === false) return;
      const risk = s.risk_level;
      if (risk === "Low") return;
      if (riskFilter !== "All Risk Levels" && risk !== riskFilter) return;

      list.push({
        id: s.sensor_code,
        level: risk === "Critical" ? "Critical" : "Warning",
        text: `${s.name} • ${s.location} • ${risk}`,
        sub: formatLastSeen(s.last_seen_at),
      });
    });
    return list.slice(0, 5);
  }, [sensorsWithPredictions, riskFilter]);

  const recentActivity = useMemo(() => {
    let filtered = [...sensorsWithPredictions];

    if (assetFilter !== "All Sensors") {
      filtered = filtered.filter((s) => s.purpose === assetFilter);
    }
    if (riskFilter !== "All Risk Levels") {
      filtered = filtered.filter((s) => s.risk_level === riskFilter);
    }

    const sorted = filtered.sort((a, b) => {
      const ta = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
      const tb = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
      return tb - ta;
    });

    return sorted.slice(0, 6).map((s) => {
      const risk = s.risk_level;
      const prob = s.predictionData?.probability ?? null;
      const tone = toneFor(risk, s.status);

      return {
        id: s.sensor_code,
        title: `${s.name}`,
        location: s.location || "—",
        time: s.last_seen_at ? new Date(s.last_seen_at).toLocaleString() : "Never",
        confidence: prob != null ? `${(prob * 100).toFixed(1)}%` : "—",
        type: s.purpose?.trim() ? s.purpose : "Telemetry",
        risk,
        next:
          normStatus(s.status) === "OFFLINE"
            ? "Connection lost"
            : `Last seen ${formatLastSeen(s.last_seen_at)}`,
        tone,
      };
    });
  }, [sensorsWithPredictions, assetFilter, riskFilter]);

  function handleRefresh() {
    if (refreshing) return;
    loadSensors({ silent: true });
  }

  async function handleDelete(sensorCode) {
    if (role !== "Admin") {
      alert("Only Admin can delete sensors.");
      return;
    }
    const ok = window.confirm(
      `Delete sensor "${sensorCode}"? This will also remove its readings.`
    );
    if (!ok) return;

    setDeletingId(sensorCode);
    try {
      const res = await fetch(
        `${API_BASE}/api/sensor-submissions/${encodeURIComponent(sensorCode)}`,
        { method: "DELETE" }
      );
      if (!res.ok && res.status !== 204) {
        throw new Error(`Delete failed (HTTP ${res.status})`);
      }
      // Refresh data after delete
      await loadSensors({ silent: true });
    } catch (e) {
      alert(e.message || "Failed to delete sensor.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <div className="crumbs">Home / Corrosion Monitoring</div>
          <h1 className="title">System Overview</h1>
        </div>

        <div className="topbarRight">
          <select
            className="select"
            value={assetFilter}
            onChange={(e) => setAssetFilter(e.target.value)}
            aria-label="Asset filter"
          >
            {purposeOptions.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>

          <select
            className="select"
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            aria-label="Risk filter"
          >
            <option>All Risk Levels</option>
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
            <option>Critical</option>
          </select>

          <button
            className={"btn" + (refreshing ? " is-loading" : "")}
            onClick={handleRefresh}
            disabled={refreshing}
            type="button"
          >
            {refreshing ? <span className="spinner" aria-hidden="true" /> : <Icon.Refresh />}
            <span className="btnText">{refreshing ? "Refreshing" : "Refresh"}</span>
          </button>

          <button
            className="roleBtn"
            type="button"
            onClick={() => setRole((r) => (r === "Admin" ? "Viewer" : "Admin"))}
            title="Toggle role (demo)"
          >
            <Icon.User />
            <span>{role}</span>
            <Icon.ChevronDown />
          </button>
        </div>
      </header>

      {error && (
        <div className="errorBanner" role="alert">
          <Icon.AlertCircle />
          <span>
            <b>Couldn't reach the server.</b> {error}
          </span>
        </div>
      )}

      <section className="kpis" aria-label="KPIs">
        {kpis.map((k) => (
          <div
            key={k.label}
            className={
              "card kpi" +
              (k.accent === "warn" ? " kpi-warn" : "") +
              (k.accent === "critical" ? " kpi-critical" : "") +
              (k.accent === "ok" ? " kpi-ok" : "")
            }
          >
            <div className="kpiLabel">{k.label}</div>
            <div className="kpiValue">
              {loading ? <span className="skeleton" style={{ display: "inline-block", width: 36, height: 24 }} /> : k.value}
            </div>
          </div>
        ))}
      </section>

      <section className="card" aria-label="Active alerts">
        <div className="cardHeader">
          <h2 className="cardTitle">
            <Icon.AlertTriangle />
            Active Alerts
          </h2>
          <Link className="link" to="/sensors">
            View all <Icon.ChevronRight />
          </Link>
        </div>

        <div className="alerts">
          {loading && (
            <>
              <div className="skeleton" style={{ height: 44 }} />
              <div className="skeleton" style={{ height: 44 }} />
            </>
          )}

          {!loading && alerts.length === 0 && (
            <div className="emptyState">
              <Icon.CheckCircle />
              <div className="emptyStateTitle">All clear</div>
              <div className="emptyStateText">No active alerts right now.</div>
            </div>
          )}

          {!loading &&
            alerts.map((a) => (
              <div
                key={a.id}
                className={
                  "alertRow " +
                  (a.level === "Critical" ? "alert-critical" : "alert-warn")
                }
              >
                <span
                  className={
                    "pill " +
                    (a.level === "Critical" ? "pill-critical" : "pill-warn")
                  }
                >
                  {a.level}
                </span>
                <span className="alertText">{a.text}</span>
                <span className="muted" style={{ whiteSpace: "nowrap" }}>
                  {a.sub}
                </span>
              </div>
            ))}
        </div>
      </section>

      <section className="card" aria-label="Recent activity">
        <div className="cardHeader">
          <h2 className="cardTitle">
            <Icon.Activity />
            Recent Activity
          </h2>
          <Link className="link" to="/sensors">
            View all <Icon.ChevronRight />
          </Link>
        </div>

        <div className="inspections">
          {loading && (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          )}

          {!loading && recentActivity.length === 0 && (
            <div className="emptyState">
              <Icon.Inbox />
              <div className="emptyStateTitle">No activity yet</div>
              <div className="emptyStateText">
                Add a sensor to start seeing telemetry here.
              </div>
            </div>
          )}

          {!loading &&
            recentActivity.map((it) => (
              <div key={it.id} className="inspection">
                <ThumbIcon tone={it.tone} />

                <div className="inspectionMain">
                  <div className="inspectionMeta">
                    <div className="metaCol">
                      <div className="metaLabel">Sensor</div>
                      <div className="metaValue">{it.title}</div>
                      <div className="metaSub">{it.location}</div>
                    </div>

                    <div className="metaCol">
                      <div className="metaLabel">Confidence</div>
                      <div className="metaValue">{it.confidence}</div>
                      <div className="metaSub">model output</div>
                    </div>

                    <div className="metaCol">
                      <div className="metaLabel">Type</div>
                      <div className="metaValue">{it.type}</div>
                      <div className="metaSub">{it.time}</div>
                    </div>

                    <div className="metaCol">
                      <div className="metaLabel">Status</div>
                      <div
                        className={
                          "metaValue " +
                          (it.tone === "critical"
                            ? "tone-critical"
                            : it.tone === "warn"
                              ? "tone-warn"
                              : it.tone === "ok"
                                ? "tone-ok"
                                : "")
                        }
                      >
                        {it.risk}
                      </div>
                      <div className="metaSub">{it.next}</div>
                    </div>
                  </div>
                </div>

                <div className="inspectionActions">
                  <button
                    className="btnDanger"
                    type="button"
                    onClick={() => handleDelete(it.id)}
                    disabled={deletingId === it.id}
                    title={role === "Admin" ? "Delete sensor" : "Switch to Admin to delete"}
                  >
                    {deletingId === it.id ? (
                      <span className="spinner spinnerDark" aria-hidden="true" />
                    ) : (
                      <Icon.Trash />
                    )}
                    {deletingId === it.id ? "Deleting" : "Delete"}
                  </button>
                </div>
              </div>
            ))}
        </div>
      </section>

      <footer className="footer">
        <span className="muted">
          Filters: {assetFilter} · {riskFilter} · Role: {role}
        </span>
      </footer>
    </>
  );
}

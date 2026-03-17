import React, { useEffect, useMemo, useState } from "react";

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

  // operational failure wins
  if (status === "OFFLINE") return "Critical";

  const prob = predictionData?.probability;

  // fallback if prediction unavailable
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

export default function Dashboard() {
  const [assetFilter, setAssetFilter] = useState("All Sensors");
  const [riskFilter, setRiskFilter] = useState("All Risk Levels");
  const [role, setRole] = useState("Admin");

  const [sensors, setSensors] = useState([]);
  const [predictionsBySensor, setPredictionsBySensor] = useState({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadPredictions(sensorList) {
    try {
      const results = await Promise.all(
        sensorList.map(async (sensor) => {
          try {
            const res = await fetch(
              `${API_BASE}/corrosion/predict/${encodeURIComponent(sensor.sensor_code)}`
            );

            if (!res.ok) {
              return [sensor.sensor_code, null];
            }

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
  }

  async function loadSensors() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/sensor-submissions/`);
      if (!res.ok) throw new Error(`GET sensors failed (${res.status})`);

      const data = await res.json();
      const sensorList = Array.isArray(data) ? data : [];

      setSensors(sensorList);
      await loadPredictions(sensorList);
    } catch (e) {
      setError(e.message || "Failed to load sensors");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSensors();
  }, []);

  const sensorsWithPredictions = useMemo(() => {
    return sensors.map((sensor) => {
      const predictionData = predictionsBySensor[sensor.sensor_code] || null;
      const riskLevel = getRiskLevelFromPrediction(sensor, predictionData);

      return {
        ...sensor,
        predictionData,
        risk_level: riskLevel,
      };
    });
  }, [sensors, predictionsBySensor]);

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
      { label: "Total Sensors", value: total },
      { label: "Active Sensors", value: active },
      { label: "Online", value: online },
      { label: "Warning", value: warning, accent: "warn" },
      { label: "Offline", value: offline, accent: "critical" },
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
        level: risk === "Critical" ? "Critical" : "Warning",
        text: `${s.name} • ${s.location} • ${risk} (${formatLastSeen(s.last_seen_at)})`,
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

      const tone =
        risk === "Critical"
          ? "critical"
          : risk === "High" || risk === "Medium"
            ? "warn"
            : normStatus(s.status) === "OFFLINE"
              ? "offline"
              : "ok";

      return {
        id: s.sensor_code,
        title: `${s.location} • ${s.name}`,
        time: s.last_seen_at ? new Date(s.last_seen_at).toLocaleString() : "Never",
        confidence: prob != null ? `${(prob * 100).toFixed(1)}%` : "—",
        type: s.purpose?.trim() ? s.purpose : "Sensor telemetry",
        thickness: null,
        risk,
        next:
          normStatus(s.status) === "OFFLINE"
            ? "Connection lost"
            : `Last seen: ${formatLastSeen(s.last_seen_at)}`,
        tone,
      };
    });
  }, [sensorsWithPredictions, assetFilter, riskFilter]);

  function handleRefresh() {
    loadSensors();

    const btn = document.getElementById("refreshBtn");
    if (!btn) return;

    btn.classList.add("is-loading");
    setTimeout(() => btn.classList.remove("is-loading"), 650);
  }

  const kpiGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 12,
  };

  return (
    <>
      <header className="topbar">
        <div>
          <div className="crumbs">Home • Corrosion Monitoring</div>
          <h1 className="title">System Overview</h1>
        </div>

        <div className="topbarRight">
          <select
            className="select"
            value={assetFilter}
            onChange={(e) => setAssetFilter(e.target.value)}
            aria-label="Asset Filter"
          >
            <option>All Sensors</option>
            <option>Sheet Metal</option>
          </select>

          <select
            className="select"
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            aria-label="Risk Filter"
          >
            <option>All Risk Levels</option>
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
            <option>Critical</option>
          </select>

          <button id="refreshBtn" className="btn" onClick={handleRefresh}>
            <span className="btnText">Refresh</span>
            <span className="spinner" aria-hidden="true" />
          </button>

          <div className="role">
            <button
              className="roleBtn"
              type="button"
              onClick={() => setRole((r) => (r === "Admin" ? "Viewer" : "Admin"))}
              title="Toggle role (demo)"
            >
              {role}
              <span className="chev" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="card" style={{ padding: 12 }}>
          <b>API error:</b> {error}
        </div>
      )}

      <section className="kpis" style={kpiGridStyle} aria-label="KPIs">
        {kpis.map((k) => (
          <div
            key={k.label}
            className={
              "card kpi" +
              (k.accent === "warn" ? " kpi-warn" : "") +
              (k.accent === "critical" ? " kpi-critical" : "")
            }
          >
            <div className="kpiLabel" style={{ whiteSpace: "nowrap" }}>
              {k.label}
            </div>
            <div className="kpiValue" style={{ whiteSpace: "nowrap" }}>
              {loading ? "…" : k.value}
            </div>
          </div>
        ))}
      </section>

      <section className="card" aria-label="Active alerts">
        <div className="cardHeader">
          <h2 className="cardTitle">Active Alerts</h2>
          <a className="link" href="#">
            View all
          </a>
        </div>

        <div className="alerts">
          {!loading && alerts.length === 0 && (
            <div className="muted" style={{ padding: 10 }}>
              No active alerts.
            </div>
          )}

          {alerts.map((a, idx) => (
            <div
              key={idx}
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
            </div>
          ))}
        </div>
      </section>

      <section className="card" aria-label="Recent activity">
        <div className="cardHeader">
          <h2 className="cardTitle">Recent Activity</h2>
        </div>

        <div className="inspections">
          {!loading &&
            recentActivity.map((it) => (
              <div key={it.id} className="inspection">
                <div className="thumb" aria-hidden="true">
                  <div className="thumbIcon">
                    {it.tone === "critical"
                      ? "⚠️"
                      : it.tone === "warn"
                        ? "⚡"
                        : it.tone === "offline"
                          ? "📡"
                          : "✔️"}
                  </div>
                  <div className="thumbBadge">?</div>
                </div>

                <div className="inspectionMain">
                  <div className="inspectionMeta">
                    <div className="metaCol">
                      <div className="metaLabel">Sensor</div>
                      <div className="metaValue">{it.title}</div>
                      <div className="metaSub">{it.time}</div>
                    </div>

                    <div className="metaCol">
                      <div className="metaLabel">Model Confidence</div>
                      <div className="metaValue">{it.confidence}</div>
                    </div>

                    <div className="metaCol">
                      <div className="metaLabel">Type</div>
                      <div className="metaValue">{it.type}</div>
                    </div>

                    <div className="metaCol">
                      <div className="metaLabel">Status</div>
                      <div className="metaValue">{it.risk}</div>
                      <div className="metaSub">{it.next}</div>
                    </div>
                  </div>
                </div>

                <div className="inspectionActions">
                  <button className="btnOutline" type="button" disabled>
                    Delete
                  </button>
                </div>
              </div>
            ))}
        </div>
      </section>

      <footer className="footer">
        <span className="muted">
          Filters: {assetFilter} • {riskFilter} • Role: {role}
        </span>
      </footer>
    </>
  );
}
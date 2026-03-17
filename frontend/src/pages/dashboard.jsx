import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader } from "../components/Card/Card";

const API_BASE = "http://127.0.0.1:8001";

function normStatus(s) {
  return (s || "").toUpperCase();
}

function getRiskLevelFromPrediction(sensor, predictionData) {
  const status = normStatus(sensor.status);

  // connection failure should still win
  if (status === "OFFLINE") return "Critical";

  const prob = predictionData?.probability;

  if (prob == null) {
    if (status === "WARNING") return "High";
    return "Low";
  }

  if (prob >= 0.85) return "Critical";
  if (prob >= 0.6) return "High";
  if (prob >= 0.3) return "Medium";

  return "Low";
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

export default function Dashboard() {
  const [assetFilter, setAssetFilter] = useState("All Sensors");
  const [riskFilter, setRiskFilter] = useState("All Risk Levels");
  const [role, setRole] = useState("Admin");

  const [sensors, setSensors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [predictionsBySensor, setPredictionsBySensor] = useState({});

  const STALE_MINUTES = 60; // tweak: "stale" after 60 mins without seeing sensor

  async function loadSensors() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/sensor-submissions/`);
      if (!res.ok) throw new Error(`GET sensors failed (${res.status})`);
      const data = await res.json();
      setSensors(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Failed to load sensors");
    } finally {
      setLoading(false);
    }
  }

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

  useEffect(() => {
    loadSensors();
  }, []);

  const kpis = useMemo(() => {
    const total = sensors.length;
    const active = sensors.filter((s) => s.is_active !== false).length;

    const online = sensors.filter((s) => normStatus(s.status) === "ONLINE").length;
    const warning = sensors.filter((s) => normStatus(s.status) === "WARNING").length;
    const offline = sensors.filter((s) => normStatus(s.status) === "OFFLINE").length;

    const stale = sensors.filter((s) => {
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
  }, [sensors]);

  const alerts = useMemo(()=>{

      let list = [];

      sensors.forEach((s)=>{

        if(s.is_active===false) return;

        const risk = getRiskLevel(s);

        if(risk==="Low") return;

        if(
          riskFilter!=="All Risk Levels"
          && risk!==riskFilter
        ) return;

        list.push({

          level:risk==="Critical"
            ?"Critical"
            :"Warning",

          text:
            `${s.name} • ${s.location} • ${risk}
            (${formatLastSeen(s.last_seen_at)})`

        });

      });

      return list.slice(0,5);

    },[sensors,riskFilter]);

  // Keep the “Recent Inspections” section but feed it “recent sensor activity” objects.
  // This keeps your UI layout intact for later ML integration.
  function getRiskLevel(sensor) {
      const st = normStatus(sensor.status);
      const mins = minutesSince(sensor.last_seen_at);

      if (st === "OFFLINE") return "Critical";

      if (st === "WARNING") return "High";

      if (mins !== null && mins >= 60) return "Medium";

      return "Low";
  }

  const recentActivity = useMemo(() => {

  let filtered = [...sensors];

  // Asset filter
  if (assetFilter !== "All Sensors") {
    filtered = filtered.filter(s =>
      s.purpose === assetFilter
    );
  }

  // Risk filter
  if (riskFilter !== "All Risk Levels") {
    filtered = filtered.filter(s =>
      getRiskLevel(s) === riskFilter
    );
  }

  const sorted = filtered.sort((a,b)=>{
    const ta = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
    const tb = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;

    return tb-ta;
  });

  return sorted.slice(0,6).map((s)=>{

    const riskLevel = getRiskLevel(s);

    const tone =
      riskLevel === "Critical" ? "critical" :
      riskLevel === "High" ? "warn" :
      riskLevel === "Medium" ? "warn" :
      "ok";

    return {

      id:s.sensor_code,

      title:`${s.location} • ${s.name}`,

      time:s.last_seen_at
        ? new Date(s.last_seen_at).toLocaleString()
        :"Never",

      confidence:null,

      type:s.purpose?.trim()
        ? s.purpose
        :"Sensor telemetry",

      thickness:null,

      risk:riskLevel,

      next:
        riskLevel==="Critical"
          ? "Connection lost"
          :`Last seen: ${formatLastSeen(s.last_seen_at)}`,

      tone
    };

  });

},[sensors,riskFilter,assetFilter]);

  function handleRefresh() {
    loadSensors();
    const btn = document.getElementById("refreshBtn");
    if (!btn) return;
    btn.classList.add("is-loading");
    setTimeout(() => btn.classList.remove("is-loading"), 650);
  }

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
        <Card>
          <div style={{ padding: 12 }}>
            <b>API error:</b> {error}
          </div>
        </Card>
      )}

      <section className="kpis" aria-label="KPIs">
        {kpis.map((k) => (
          <Card
            key={k.label}
            className={
              "kpi" +
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
          </Card>
        ))}
      </section>

      <Card aria-label="Active alerts">
        <CardHeader
          title="Active Alerts"
          right={
            <a className="link" href="#">
              View all
            </a>
          }
        />

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
      </Card>

      <Card aria-label="Recent activity">
        <CardHeader title="Recent Activity" />

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
                      <div className="metaValue">{it.confidence ?? "—"}</div>
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
      </Card>

      <footer className="footer">
        <span className="muted">
          Filters: {assetFilter} • {riskFilter} • Role: {role}
        </span>
      </footer>
    </>
  );
}
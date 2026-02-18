import React, { useMemo, useState } from "react";

export default function Dashboard() {
  const [assetFilter, setAssetFilter] = useState("All Sensors");
  const [riskFilter, setRiskFilter] = useState("All Risk Levels");
  const [role, setRole] = useState("Admin");

  const inspections = useMemo(
  () => [
    {
      id: "S-204",
      title: "Container 1 Sensor-204",
      time: "02/18/2026 08:49 AM",
      confidence: 97,
      type: "Multiparameter system",
      thickness: "4.2 ± 0.3 mm",
      note: "Normal: 6.0 – 8.0 mm",
      riskLevel: "High",
      status: "Online",
    },
    {
      id: "S-116",
      title: "Container 3 Sensor-116",
      time: "02/18/2026 07:20 AM",
      confidence: 91,
      type: "Multiparameter system",
      risk: "Medium",
      next: "Next check: 6 hours",
      riskLevel: "Medium",
      status: "Online",
    },
    {
      id: "S-101",
      title: "Container 3 Sensor-101",
      time: "02/18/2026 06:10 AM",
      confidence: 88,
      type: "Humidity + temp",
      risk: "Low",
      next: "Next check: 24 hours",
      riskLevel: "Low",
      status: "Online",
    },
    {
      id: "S-331",
      title: "Container 2 Sensor-331",
      time: "Last seen 02/18/2026 8:42 AM",
      confidence: 0,
      type: "Multiparameter system",
      risk: "Critical",
      next: "Connection lost",
      riskLevel: "Critical",
      status: "Offline",
    },
  ],
  []
);


  const alerts = useMemo(
  () => [
    {
      level: "Critical",
      text: "Sheet Metal D2 • Degradation beyond threshold",
    },
    {
      level: "Warning: High Risk",
      text: "Sheet Metal C3 • Rapid thickness change detected",
    },
      {
      level: "Warning: Medium Risk",
      text: "Sheet Metal B4 • Moderate thickness change detected",
    },
  ],
  []
);


  const kpis = useMemo(() => {
  const total = inspections.length;

  const online = inspections.filter((s) => s.status === "Online").length;

  const critical = inspections.filter((s) => s.riskLevel === "Critical").length;

  const atRisk = inspections.filter(
    (s) => s.riskLevel === "High" || s.riskLevel === "Critical"
  ).length;

  return [
    { label: "Active Sensors", value: total },
    { label: "At Risk", value: atRisk, accent: "warn" },
    { label: "Critical", value: critical, accent: "critical" },
    { label: "Sensors Online", value: online },
  ];
}, [inspections]);



  function handleRefresh() {
    const btn = document.getElementById("refreshBtn");
    if (!btn) return;
    btn.classList.add("is-loading");
    setTimeout(() => btn.classList.remove("is-loading"), 650);
  }

  // Keep your exact KPI “not squished” behavior
  const kpiGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 12,
  };

  return (
    <>
      {/* TOP BAR */}
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
            <option>All Assets</option>
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

      {/* KPIs */}
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
              {k.value}
            </div>
          </div>
        ))}
      </section>

      {/* Alerts */}
      <section className="card" aria-label="Active alerts">
        <div className="cardHeader">
          <h2 className="cardTitle">Active Alerts</h2>
          <a className="link" href="#">
            View all
          </a>
        </div>

        <div className="alerts">
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

      {/* Recent Inspections */}
      <section className="card" aria-label="Recent inspections">
        <div className="cardHeader">
          <h2 className="cardTitle">Recent Inspections</h2>
        </div>

        <div className="inspections">
          {inspections.map((it) => (
            <div key={it.id} className="inspection">
              <div className="thumb" aria-hidden="true">
                <div className="thumbIcon">
                    {it.tone === "critical" ? "⚠️" :
                     it.tone === "warn" ? "⚡" :
                     it.tone === "offline" ? "📡" :
                     "✔️"}
                  </div>
                <div className="thumbBadge">?</div>
              </div>


              <div className="inspectionMain">
                <div className="inspectionMeta">
                  <div className="metaCol">
                    <div className="metaLabel">Result</div>
                    <div
                      className={
                        "metaValue " +
                        (it.tone === "critical" ? "tone-critical" : "tone-warn")
                      }
                    >
                      {it.title}
                    </div>
                    <div className="metaSub">{it.time}</div>
                  </div>

                  <div className="metaCol">
                    <div className="metaLabel">Confidence</div>
                    <div className="metaValue">{it.confidence}%</div>
                  </div>

                  <div className="metaCol">
                    <div className="metaLabel">Inspection Type</div>
                    <div className="metaValue">{it.type}</div>
                  </div>

                  <div className="metaCol">
                    <div className="metaLabel">
                      {it.thickness ? "Thickness" : "Estimated Risk"}
                    </div>
                    <div className="metaValue">
                      {it.thickness ? it.thickness : it.risk}
                    </div>
                    <div className="metaSub">{it.note ? it.note : it.next}</div>
                  </div>
                </div>
              </div>

              <div className="inspectionActions">
                <button className="btnOutline" type="button">
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

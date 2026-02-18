import React, { useMemo, useState } from "react";

export default function Sensors() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");

  const sensors = useMemo(
    () => [
      { id: "S-101", name: "Sheet Metal A1", location: "Container 3", status: "Online", risk: "Low", lastSeen: "2 min ago" },
      { id: "S-116", name: "Sheet Metal B4", location: "Container 3", status: "Warning", risk: "Medium", lastSeen: "6 min ago" },
      { id: "S-204", name: "Sheet Metal C3", location: "Container 1", status: "Warning", risk: "High", lastSeen: "18 min ago" },
      { id: "S-331", name: "Sheet Metal D2", location: "Container 2", status: "Offline", risk: "Critical", lastSeen: "3 hrs ago" },
    ],
    []
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sensors.filter((s) => {
      const matchesQuery =
        !q ||
        s.id.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.location.toLowerCase().includes(q);

      const matchesStatus = status === "All" || s.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [query, status, sensors]);

  const pillClass = (risk, status) => {
    if (status === "Offline") return "pill pill-critical";
    if (risk === "Critical") return "pill pill-critical";
    if (risk === "High") return "pill pill-warn";
    if (risk === "Medium") return "pill pill-warn";
    if (risk === "Low") return "pill pill-ok";
    return "pill";
  };

  const rowClass = (risk, status) => {
    if (status === "Offline") return "alertRow alert-critical";
    if (risk === "Critical") return "alertRow alert-critical";
    if (risk === "High" || risk === "Medium") return "alertRow alert-warn";
    if (risk === "Low") return "alertRow alert-ok";
    return "alertRow";
  };

  return (
    <>
      <header className="topbar">
        <div>
          <div className="crumbs">Sensors • Corrosion Monitoring</div>
          <h1 className="title">Sensors</h1>
        </div>

        <div className="topbarRight">
          <input
            className="select"
            style={{ minWidth: 240 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by ID, name, or location…"
            aria-label="Search sensors"
          />

          <select
            className="select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Status filter"
          >
            <option>All</option>
            <option>Online</option>
            <option>Warning</option>
            <option>Offline</option>
          </select>
        </div>
      </header>

      <section className="card">
        <div className="cardHeader">
          <h2 className="cardTitle">Sensor List</h2>
          <span className="muted">{filtered.length} shown</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((s) => (
            <div
              key={s.id}
              className={rowClass(s.risk, s.status)}
              style={{ justifyContent: "space-between" }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontWeight: 800 }}>
                  {s.name} <span className="muted">• {s.id}</span>
                </div>
                <div className="muted">
                  {s.location} • Last seen: {s.lastSeen}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className={pillClass(s.risk, s.status)}>{s.risk}</span>
                <span className="muted">{s.status}</span>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="muted" style={{ padding: 10 }}>
              No sensors match your filters.
            </div>
          )}
        </div>
      </section>
    </>
  );
}

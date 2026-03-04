import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = "http://127.0.0.1:8001"; // <- change if you're on 8000

function titleCaseStatus(s) {
  if (!s) return "";
  const up = s.toUpperCase();
  if (up === "ONLINE") return "Online";
  if (up === "WARNING") return "Warning";
  if (up === "OFFLINE") return "Offline";
  return s;
}

function formatLastSeen(lastSeenAt) {
  if (!lastSeenAt) return "Never";
  const dt = new Date(lastSeenAt);
  const diffMs = Date.now() - dt.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

export default function Sensors() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [sensors, setSensors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function loadSensors() {
      setLoading(true);
      setError("");

      try {
        const res = await fetch("http://localhost:8001/api/sensor-submissions/");
        if (!res.ok) throw new Error(`GET /api/sensors failed (${res.status})`);

        const data = await res.json();

        // Map DB model -> your UI model
        const mapped = (data || []).map((s) => ({
          id: s.sensor_code,
          name: s.name,
          location: s.location,
          status: titleCaseStatus(s.status),
          // you don't have risk in DB yet, so default it or derive it later
          risk: "Low",
          lastSeen: formatLastSeen(s.last_seen_at),
        }));

        if (!cancelled) setSensors(mapped);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load sensors");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSensors();
    return () => {
      cancelled = true;
    };
  }, []);

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
          <button className="primaryBtn" onClick={() => navigate("/sensors/new")}>
            + Add Sensor
          </button>

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
          <span className="muted">
            {loading ? "Loading…" : `${filtered.length} shown`}
          </span>
        </div>

        {error && (
          <div className="muted" style={{ padding: 10 }}>
            <b>API error:</b> {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {!loading &&
            filtered.map((s) => (
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

          {!loading && filtered.length === 0 && (
            <div className="muted" style={{ padding: 10 }}>
              No sensors match your filters.
            </div>
          )}
        </div>
      </section>
    </>
  );
}
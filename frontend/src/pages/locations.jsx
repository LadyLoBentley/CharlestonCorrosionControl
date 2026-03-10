import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

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

function normalizeRisk(risk) {
  if (!risk) return "Low";
  const r = risk.toLowerCase();
  if (r === "critical") return "Critical";
  if (r === "high") return "High";
  if (r === "medium") return "Medium";
  return "Low";
}

export default function Locations() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function loadLocations() {
      setLoading(true);
      setError("");

      try {
        const res = await fetch("http://localhost:8001/api/locations/");
        if (!res.ok) {
          throw new Error(`GET /api/locations failed (${res.status})`);
        }

        const data = await res.json();

        const mapped = (data || []).map((loc) => ({
          id: loc.location_code || loc.id,
          name: loc.name,
          type: loc.location_type || "Location",
          status: titleCaseStatus(loc.status),
          risk: normalizeRisk(loc.risk_level),
          sensorCount: loc.sensor_count ?? 0,
          onlineCount: loc.online_count ?? 0,
          offlineCount: loc.offline_count ?? 0,
          lastSeen: formatLastSeen(loc.last_seen_at),
        }));

        if (!cancelled) setLocations(mapped);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load locations");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadLocations();

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return locations.filter((loc) => {
      const matchesQuery =
        !q ||
        String(loc.id).toLowerCase().includes(q) ||
        loc.name.toLowerCase().includes(q) ||
        loc.type.toLowerCase().includes(q);

      const matchesStatus = status === "All" || loc.status === status;

      return matchesQuery && matchesStatus;
    });
  }, [query, status, locations]);

  const pillClass = (risk, status) => {
    if (status === "Offline") return "pill pill-critical";
    if (risk === "Critical") return "pill pill-critical";
    if (risk === "High" || risk === "Medium") return "pill pill-warn";
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
          <div className="crumbs">Assets • Corrosion Monitoring</div>
          <h1 className="title">Locations</h1>
        </div>

        <div className="topbarRight">
          <button className="btn" onClick={() => navigate("/locations/new")}>
            + Add Location
          </button>

          <input
            className="select"
            style={{ minWidth: 240 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by ID, name, or type…"
            aria-label="Search locations"
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
          <h2 className="cardTitle">Location List</h2>
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
            filtered.map((loc) => (
              <button
                key={loc.id}
                type="button"
                className={`${rowClass(loc.risk, loc.status)} clickableRow`}
                onClick={() => navigate(`/locations/${loc.id}`)}
                style={{
                  justifyContent: "space-between",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontWeight: 800 }}>
                    {loc.name} <span className="muted">• {loc.id}</span>
                  </div>

                  <div className="muted">
                    {loc.type} • Last seen: {loc.lastSeen}
                  </div>

                  <div className="muted" style={{ fontSize: 13 }}>
                    {loc.sensorCount} sensors • {loc.onlineCount} online •{" "}
                    {loc.offlineCount} offline
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className={pillClass(loc.risk, loc.status)}>{loc.risk}</span>
                  <span className="muted">{loc.status}</span>
                </div>
              </button>
            ))}

          {!loading && filtered.length === 0 && (
            <div className="muted" style={{ padding: 10 }}>
              No locations match your filters.
            </div>
          )}
        </div>
      </section>
    </>
  );
}
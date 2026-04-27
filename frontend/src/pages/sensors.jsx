import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader } from "../components/Card/Card";
import { Icon } from "../components/Icons.jsx";

const API_BASE = "http://127.0.0.1:8001";
const STALE_MINUTES = 60;

function titleCaseStatus(s) {
  if (!s) return "";
  const up = s.toUpperCase();
  if (up === "ONLINE") return "Online";
  if (up === "WARNING") return "Warning";
  if (up === "OFFLINE") return "Offline";
  return s;
}

function minutesSince(dtStr) {
  if (!dtStr) return null;
  const dt = new Date(dtStr);
  return Math.floor((Date.now() - dt.getTime()) / 60000);
}

function formatLastSeen(lastSeenAt) {
  if (!lastSeenAt) return "Never";
  const diffMin = minutesSince(lastSeenAt);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

function riskFromPrediction(sensor, prob) {
  const status = (sensor.status || "").toUpperCase();
  if (status === "OFFLINE") return "Critical";
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

export default function Sensors() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sensors, setSensors] = useState([]);
  const [predictions, setPredictions] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const navigate = useNavigate();

  const loadSensors = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/sensor-submissions/`);
      if (!res.ok) throw new Error(`Failed to load sensors (HTTP ${res.status})`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setSensors(list);

      // Fetch predictions in parallel (best-effort)
      const predResults = await Promise.all(
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
      setPredictions(Object.fromEntries(predResults));
    } catch (e) {
      setError(e.message || "Failed to load sensors");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSensors();
  }, [loadSensors]);

  const enriched = useMemo(() => {
    return sensors.map((s) => {
      const prob = predictions[s.sensor_code]?.probability ?? null;
      return {
        id: s.sensor_code,
        name: s.name,
        location: s.location,
        purpose: s.purpose,
        statusRaw: s.status,
        status: titleCaseStatus(s.status),
        risk: riskFromPrediction(s, prob),
        lastSeen: formatLastSeen(s.last_seen_at),
        prob,
      };
    });
  }, [sensors, predictions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter((s) => {
      const matchesQuery =
        !q ||
        s.id.toLowerCase().includes(q) ||
        (s.name || "").toLowerCase().includes(q) ||
        (s.location || "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "All" || s.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [query, statusFilter, enriched]);

  const pillClass = (risk, status) => {
    if (status === "Offline") return "pill pill-critical";
    if (risk === "Critical") return "pill pill-critical";
    if (risk === "High" || risk === "Medium") return "pill pill-warn";
    if (risk === "Low") return "pill pill-ok";
    return "pill pill-muted";
  };

  const statusPillClass = (status) => {
    if (status === "Online") return "pill pill-ok";
    if (status === "Warning") return "pill pill-warn";
    if (status === "Offline") return "pill pill-critical";
    return "pill pill-muted";
  };

  async function handleDelete(e, sensorCode) {
    e.stopPropagation();
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
      await loadSensors();
    } catch (err) {
      alert(err.message || "Failed to delete sensor.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <div className="crumbs">Sensors / Corrosion Monitoring</div>
          <h1 className="title">Sensors</h1>
        </div>

        <div className="topbarRight">
          <div className="searchField">
            <Icon.Search width={14} height={14} />
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by ID, name, or location"
              aria-label="Search sensors"
            />
          </div>

          <select
            className="select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Status filter"
          >
            <option>All</option>
            <option>Online</option>
            <option>Warning</option>
            <option>Offline</option>
          </select>

          <button className="btn" onClick={() => navigate("/sensors/new")} type="button">
            <Icon.Plus />
            <span>Add Sensor</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="errorBanner" role="alert">
          <Icon.AlertCircle />
          <span>
            <b>Couldn't load sensors.</b> {error}
          </span>
        </div>
      )}

      <Card>
        <CardHeader
          title={
            <>
              <Icon.Sensor style={{ width: 16, height: 16, color: "var(--muted)" }} />
              <span>Sensor List</span>
            </>
          }
          right={
            <span className="muted">
              {loading ? "Loading…" : `${filtered.length} of ${enriched.length}`}
            </span>
          }
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {loading && (
            <>
              <div className="skeleton" style={{ height: 60 }} />
              <div className="skeleton" style={{ height: 60 }} />
              <div className="skeleton" style={{ height: 60 }} />
            </>
          )}

          {!loading && filtered.length === 0 && (
            <div className="emptyState">
              <Icon.Inbox />
              <div className="emptyStateTitle">
                {enriched.length === 0 ? "No sensors yet" : "No matches"}
              </div>
              <div className="emptyStateText">
                {enriched.length === 0
                  ? "Click + Add Sensor to get started."
                  : "Try clearing your filters."}
              </div>
            </div>
          )}

          {!loading &&
            filtered.map((s) => (
              <div
                key={s.id}
                className="sensorRow"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/sensors/${encodeURIComponent(s.id)}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/sensors/${encodeURIComponent(s.id)}`);
                  }
                }}
              >
                <div className="sensorRowMain">
                  <div className="sensorRowName">
                    {s.name}
                    <span className="sensorRowCode">{s.id}</span>
                  </div>
                  <div className="sensorRowMeta">
                    {s.location || "—"} · Last seen {s.lastSeen}
                    {s.purpose ? ` · ${s.purpose}` : ""}
                  </div>
                </div>

                <div className="sensorRowRight">
                  <span className={pillClass(s.risk, s.status)}>{s.risk}</span>
                  <span className={statusPillClass(s.status)}>{s.status}</span>
                  <button
                    className="btnDanger"
                    type="button"
                    onClick={(e) => handleDelete(e, s.id)}
                    disabled={deletingId === s.id}
                    aria-label={`Delete ${s.name}`}
                    title="Delete sensor"
                  >
                    {deletingId === s.id ? (
                      <span className="spinner spinnerDark" aria-hidden="true" />
                    ) : (
                      <Icon.Trash />
                    )}
                  </button>
                  <Icon.ChevronRight
                    width={16}
                    height={16}
                    style={{ color: "var(--muted)" }}
                  />
                </div>
              </div>
            ))}
        </div>
      </Card>
    </>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../components/Icons.jsx";

const API_BASE = "http://127.0.0.1:8001";
const STALE_MINUTES = 60;

function normStatus(s) {
  return (s || "").toUpperCase();
}

function titleCaseStatus(s) {
  const up = normStatus(s);
  if (up === "ONLINE") return "Online";
  if (up === "WARNING") return "Warning";
  if (up === "OFFLINE") return "Offline";
  return s || "—";
}

function minutesSince(dt) {
  if (!dt) return null;
  return Math.floor((Date.now() - new Date(dt).getTime()) / 60000);
}

function formatLastSeen(dt) {
  if (!dt) return "Never";
  const m = minutesSince(dt);
  if (m === null) return "Never";
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

function riskFrom(sensor, prob) {
  const status = normStatus(sensor.status);
  if (status === "OFFLINE") return "Critical";
  if (prob == null) {
    if (status === "WARNING") return "High";
    const m = minutesSince(sensor.last_seen_at);
    if (m !== null && m >= STALE_MINUTES) return "Medium";
    return "Low";
  }
  if (prob >= 0.85) return "Critical";
  if (prob >= 0.6) return "High";
  if (prob >= 0.3) return "Medium";
  return "Low";
}

const RISK_RANK = { Critical: 4, High: 3, Medium: 2, Low: 1 };

function highestRisk(sensors) {
  let best = "Low";
  for (const s of sensors) {
    if ((RISK_RANK[s.risk] || 0) > (RISK_RANK[best] || 0)) best = s.risk;
  }
  return best;
}

function riskPillClass(risk) {
  if (risk === "Critical") return "pill pill-critical";
  if (risk === "High" || risk === "Medium") return "pill pill-warn";
  if (risk === "Low") return "pill pill-ok";
  return "pill pill-muted";
}

function statusPillClass(status) {
  if (status === "Online") return "pill pill-ok";
  if (status === "Warning") return "pill pill-warn";
  if (status === "Offline") return "pill pill-critical";
  return "pill pill-muted";
}

export default function Locations() {
  const navigate = useNavigate();

  const [sensors, setSensors] = useState([]);
  const [predictions, setPredictions] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/sensor-submissions/`);
      if (!res.ok) throw new Error(`Failed to load sensors (HTTP ${res.status})`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setSensors(list);

      // Predictions in parallel (best-effort)
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
    } catch (e) {
      setError(e.message || "Failed to load locations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Group sensors by location
  const locations = useMemo(() => {
    const groups = new Map();
    for (const s of sensors) {
      const key = (s.location || "").trim() || "(Unassigned)";
      if (!groups.has(key)) groups.set(key, []);
      const prob = predictions[s.sensor_code]?.probability ?? null;
      groups.get(key).push({
        id: s.sensor_code,
        name: s.name,
        statusRaw: normStatus(s.status),
        status: titleCaseStatus(s.status),
        risk: riskFrom(s, prob),
        lastSeen: formatLastSeen(s.last_seen_at),
        purpose: s.purpose,
        is_active: s.is_active,
      });
    }

    const out = [];
    for (const [name, list] of groups) {
      const online = list.filter((x) => x.statusRaw === "ONLINE").length;
      const warning = list.filter((x) => x.statusRaw === "WARNING").length;
      const offline = list.filter((x) => x.statusRaw === "OFFLINE").length;
      const top = highestRisk(list);
      out.push({
        name,
        sensors: list.sort((a, b) => a.name.localeCompare(b.name)),
        total: list.length,
        online,
        warning,
        offline,
        topRisk: top,
      });
    }

    // Sort: highest risk first, then by sensor count, then alpha
    out.sort((a, b) => {
      const r = (RISK_RANK[b.topRisk] || 0) - (RISK_RANK[a.topRisk] || 0);
      if (r !== 0) return r;
      if (b.total !== a.total) return b.total - a.total;
      return a.name.localeCompare(b.name);
    });

    return out;
  }, [sensors, predictions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter((loc) => {
      if (loc.name.toLowerCase().includes(q)) return true;
      return loc.sensors.some(
        (s) =>
          s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
      );
    });
  }, [locations, query]);

  const totalSensors = sensors.length;

  return (
    <>
      <header className="topbar">
        <div>
          <div className="crumbs">Locations / Corrosion Monitoring</div>
          <h1 className="title">Locations</h1>
        </div>

        <div className="topbarRight">
          <div className="searchField">
            <Icon.Search width={14} height={14} />
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search location or sensor"
              aria-label="Search locations"
            />
          </div>

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
            <b>Couldn't load locations.</b> {error}
          </span>
        </div>
      )}

      {/* KPI strip */}
      <section className="kpis" aria-label="Location KPIs">
        <div className="card kpi">
          <div className="kpiLabel">Locations</div>
          <div className="kpiValue">
            {loading ? (
              <span className="skeleton" style={{ display: "inline-block", width: 36, height: 24 }} />
            ) : (
              locations.length
            )}
          </div>
        </div>
        <div className="card kpi kpi-ok">
          <div className="kpiLabel">Total Sensors</div>
          <div className="kpiValue">
            {loading ? (
              <span className="skeleton" style={{ display: "inline-block", width: 36, height: 24 }} />
            ) : (
              totalSensors
            )}
          </div>
        </div>
        <div className="card kpi kpi-critical">
          <div className="kpiLabel">At-Risk Locations</div>
          <div className="kpiValue">
            {loading ? (
              <span className="skeleton" style={{ display: "inline-block", width: 36, height: 24 }} />
            ) : (
              locations.filter(
                (l) => l.topRisk === "Critical" || l.topRisk === "High"
              ).length
            )}
          </div>
        </div>
      </section>

      {/* Location grid */}
      {loading ? (
        <div className="locationGrid">
          <div className="card skeleton" style={{ height: 240 }} />
          <div className="card skeleton" style={{ height: 240 }} />
          <div className="card skeleton" style={{ height: 240 }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="emptyState">
            <Icon.MapPin />
            <div className="emptyStateTitle">
              {locations.length === 0 ? "No locations yet" : "No matches"}
            </div>
            <div className="emptyStateText">
              {locations.length === 0
                ? "Add a sensor with a location to see it here."
                : "Try a different search term."}
            </div>
          </div>
        </div>
      ) : (
        <div className="locationGrid">
          {filtered.map((loc) => (
            <section
              className="card locationCard locationCardClickable"
              key={loc.name}
              role="button"
              tabIndex={0}
              onClick={() =>
                navigate(`/locations/${encodeURIComponent(loc.name)}`)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(`/locations/${encodeURIComponent(loc.name)}`);
                }
              }}
            >
              <div className="locationHead">
                <div className="locationTitle">
                  <span className="locationIcon" aria-hidden="true">
                    <Icon.MapPin width={16} height={16} />
                  </span>
                  <div>
                    <div className="locationName">{loc.name}</div>
                    <div className="muted">
                      {loc.total} sensor{loc.total === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
                <span className={riskPillClass(loc.topRisk)}>{loc.topRisk}</span>
              </div>

              <div className="locationStats">
                <div className="statBox">
                  <div className="statValue tone-ok">{loc.online}</div>
                  <div className="statLabel">Online</div>
                </div>
                <div className="statBox">
                  <div className="statValue tone-warn">{loc.warning}</div>
                  <div className="statLabel">Warning</div>
                </div>
                <div className="statBox">
                  <div className="statValue tone-critical">{loc.offline}</div>
                  <div className="statLabel">Offline</div>
                </div>
              </div>

              <div className="locationSensors">
                {loc.sensors.slice(0, 5).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="locationSensorRow"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/sensors/${encodeURIComponent(s.id)}`);
                    }}
                    title={`Open ${s.name}`}
                  >
                    <div className="locationSensorMain">
                      <div className="locationSensorName">{s.name}</div>
                      <div className="locationSensorMeta">
                        <span className="sensorRowCode" style={{ marginLeft: 0 }}>
                          {s.id}
                        </span>
                        <span className="muted"> · {s.lastSeen}</span>
                      </div>
                    </div>
                    <div className="locationSensorRight">
                      <span className={statusPillClass(s.status)}>{s.status}</span>
                      <Icon.ChevronRight
                        width={14}
                        height={14}
                        style={{ color: "var(--muted)" }}
                      />
                    </div>
                  </button>
                ))}
                {loc.sensors.length > 5 && (
                  <div className="muted" style={{ padding: "6px 4px 0" }}>
                    + {loc.sensors.length - 5} more
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

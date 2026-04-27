import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/Icons.jsx";

const API_BASE = "http://127.0.0.1:8001";
const STALE_MINUTES = 60;
const UNASSIGNED = "(Unassigned)";

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

export default function LocationDetail() {
  const { name: rawName } = useParams();
  const name = decodeURIComponent(rawName || "");
  const isUnassigned = name === UNASSIGNED;
  const navigate = useNavigate();

  const [sensors, setSensors] = useState([]);
  const [predictions, setPredictions] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newName, setNewName] = useState(name);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState("");
  const [renameSavedAt, setRenameSavedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/sensor-submissions/`);
      if (!res.ok) throw new Error(`Failed to load sensors (HTTP ${res.status})`);
      const all = await res.json();
      const list = (Array.isArray(all) ? all : []).filter((s) => {
        const loc = (s.location || "").trim() || UNASSIGNED;
        return loc === name;
      });
      setSensors(list);

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
      setError(e.message || "Failed to load location");
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => {
    load();
    setNewName(name);
    setRenameError("");
    setRenameSavedAt(null);
  }, [load, name]);

  const enriched = useMemo(() => {
    return sensors
      .map((s) => {
        const prob = predictions[s.sensor_code]?.probability ?? null;
        return {
          id: s.sensor_code,
          name: s.name,
          purpose: s.purpose,
          statusRaw: normStatus(s.status),
          status: titleCaseStatus(s.status),
          risk: riskFrom(s, prob),
          lastSeen: formatLastSeen(s.last_seen_at),
          is_active: s.is_active,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sensors, predictions]);

  const stats = useMemo(() => {
    const total = enriched.length;
    const online = enriched.filter((s) => s.statusRaw === "ONLINE").length;
    const warning = enriched.filter((s) => s.statusRaw === "WARNING").length;
    const offline = enriched.filter((s) => s.statusRaw === "OFFLINE").length;
    const topRisk = total ? highestRisk(enriched) : "Low";
    return { total, online, warning, offline, topRisk };
  }, [enriched]);

  const dirty = newName.trim() !== name && newName.trim().length > 0;

  async function handleRename(e) {
    e?.preventDefault?.();
    if (!dirty || renaming || isUnassigned) return;
    setRenaming(true);
    setRenameError("");
    try {
      const res = await fetch(
        `${API_BASE}/api/locations/${encodeURIComponent(name)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ new_name: newName.trim() }),
        }
      );
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          if (body?.detail) detail = body.detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      setRenameSavedAt(new Date());
      // Navigate to the new URL — page will reload data under the new name.
      navigate(`/locations/${encodeURIComponent(newName.trim())}`, {
        replace: true,
      });
    } catch (err) {
      setRenameError(err.message || "Failed to rename location");
    } finally {
      setRenaming(false);
    }
  }

  function handleAddSensorHere() {
    if (isUnassigned) {
      navigate("/sensors/new");
    } else {
      navigate(`/sensors/new?location=${encodeURIComponent(name)}`);
    }
  }

  if (loading) {
    return (
      <>
        <header className="topbar">
          <div>
            <div className="crumbs">Locations / Loading…</div>
            <h1 className="title">Loading location…</h1>
          </div>
        </header>
        <div className="card">
          <div className="skeleton" style={{ height: 16, width: "30%", marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 14, width: "60%", marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 14, width: "40%" }} />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <header className="topbar">
          <div>
            <div className="crumbs">Locations / Error</div>
            <h1 className="title">{name}</h1>
          </div>
          <div className="topbarRight">
            <button
              className="btnGhost"
              type="button"
              onClick={() => navigate("/locations")}
            >
              <Icon.ArrowLeft />
              <span>Back to Locations</span>
            </button>
          </div>
        </header>
        <div className="errorBanner" role="alert">
          <Icon.AlertCircle />
          <span>{error}</span>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="topbar">
        <div>
          <div className="crumbs">Locations / {name}</div>
          <h1 className="title">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <Icon.MapPin width={22} height={22} />
              {name}
            </span>
          </h1>
        </div>
        <div className="topbarRight">
          <button
            className="btnGhost"
            type="button"
            onClick={() => navigate("/locations")}
          >
            <Icon.ArrowLeft />
            <span>Back</span>
          </button>
          <button className="btn" type="button" onClick={handleAddSensorHere}>
            <Icon.Plus />
            <span>Add Sensor Here</span>
          </button>
        </div>
      </header>

      {/* Summary card */}
      <section className="card">
        <div className="detailGrid">
          <div className="detailField">
            <div className="metaLabel">Total Sensors</div>
            <div className="metaValue">{stats.total}</div>
          </div>
          <div className="detailField">
            <div className="metaLabel">Online</div>
            <div className="metaValue tone-ok">{stats.online}</div>
          </div>
          <div className="detailField">
            <div className="metaLabel">Warning</div>
            <div className="metaValue tone-warn">{stats.warning}</div>
          </div>
          <div className="detailField">
            <div className="metaLabel">Offline</div>
            <div className="metaValue tone-critical">{stats.offline}</div>
          </div>
          <div className="detailField">
            <div className="metaLabel">Top Risk</div>
            <div className="metaValue">
              <span className={riskPillClass(stats.topRisk)}>
                {stats.total ? stats.topRisk : "—"}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Rename card */}
      <section className="card">
        <div className="cardHeader">
          <h2 className="cardTitle">
            <Icon.MapPin />
            Edit Location
          </h2>
          {renameSavedAt && (
            <span className="pill pill-ok">
              <Icon.CheckCircle width={12} height={12} />
              Saved {renameSavedAt.toLocaleTimeString()}
            </span>
          )}
        </div>

        {isUnassigned && (
          <div
            className="errorBanner"
            role="status"
            style={{
              marginBottom: 14,
              background: "var(--info-bg)",
              borderColor: "rgba(14,165,233,0.25)",
              color: "#075985",
            }}
          >
            <Icon.AlertCircle />
            <span>
              "(Unassigned)" is a placeholder for sensors with no location set.
              Open an individual sensor to give it a location.
            </span>
          </div>
        )}

        {renameError && (
          <div className="errorBanner" role="alert" style={{ marginBottom: 14 }}>
            <Icon.AlertCircle />
            <span>
              <b>Couldn't rename location.</b> {renameError}
            </span>
          </div>
        )}

        <form onSubmit={handleRename} className="formStack">
          <div className="formField">
            <label className="formLabel" htmlFor="locName">
              Location Name
            </label>
            <input
              id="locName"
              className="input"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setRenameSavedAt(null);
              }}
              placeholder="e.g. Building 12, North Wall"
              disabled={isUnassigned}
              required
            />
            <span className="formHint">
              {isUnassigned
                ? "Cannot rename the (Unassigned) group."
                : `Renames the location for all ${stats.total} sensor${stats.total === 1 ? "" : "s"} here.`}
            </span>
          </div>

          <div className="formActions">
            <button
              className={"btn" + (renaming ? " is-loading" : "")}
              type="submit"
              disabled={!dirty || renaming || isUnassigned}
              title={
                isUnassigned
                  ? "Cannot rename (Unassigned)"
                  : !dirty
                    ? "Change the name to enable Save"
                    : "Save the new name"
              }
            >
              {renaming ? (
                <span className="spinner" aria-hidden="true" />
              ) : (
                <Icon.CheckCircle />
              )}
              <span className="btnText">{renaming ? "Saving" : "Rename Location"}</span>
            </button>

            <button
              type="button"
              className="btnGhost"
              onClick={() => {
                setNewName(name);
                setRenameError("");
                setRenameSavedAt(null);
              }}
              disabled={!dirty || renaming}
            >
              Reset
            </button>
          </div>
        </form>
      </section>

      {/* Sensors at this location */}
      <section className="card">
        <div className="cardHeader">
          <h2 className="cardTitle">
            <Icon.Sensor />
            Sensors at this Location
          </h2>
          <span className="muted">{stats.total} total</span>
        </div>

        {enriched.length === 0 ? (
          <div className="emptyState">
            <Icon.Inbox />
            <div className="emptyStateTitle">No sensors here yet</div>
            <div className="emptyStateText">
              Click <b>Add Sensor Here</b> to add the first one.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {enriched.map((s) => (
              <div
                key={s.id}
                className="sensorRow"
                role="button"
                tabIndex={0}
                onClick={() =>
                  navigate(`/sensors/${encodeURIComponent(s.id)}`)
                }
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
                    Last seen {s.lastSeen}
                    {s.purpose ? ` · ${s.purpose}` : ""}
                  </div>
                </div>
                <div className="sensorRowRight">
                  <span className={riskPillClass(s.risk)}>{s.risk}</span>
                  <span className={statusPillClass(s.status)}>{s.status}</span>
                  <Icon.ChevronRight
                    width={16}
                    height={16}
                    style={{ color: "var(--muted)" }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

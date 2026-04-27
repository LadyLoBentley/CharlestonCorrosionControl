import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  return Math.floor((Date.now() - new Date(dtStr).getTime()) / 60000);
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

function formatDateTime(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString();
}

function riskFrom(sensor, prob) {
  const status = (sensor?.status || "").toUpperCase();
  if (status === "OFFLINE") return "Critical";
  if (prob == null) {
    if (status === "WARNING") return "High";
    const m = minutesSince(sensor?.last_seen_at);
    if (m !== null && m >= STALE_MINUTES) return "Medium";
    return "Low";
  }
  if (prob >= 0.85) return "Critical";
  if (prob >= 0.6) return "High";
  if (prob >= 0.3) return "Medium";
  return "Low";
}

function statusPillClass(status) {
  if (status === "Online") return "pill pill-ok";
  if (status === "Warning") return "pill pill-warn";
  if (status === "Offline") return "pill pill-critical";
  return "pill pill-muted";
}

function riskPillClass(risk) {
  if (risk === "Critical") return "pill pill-critical";
  if (risk === "High" || risk === "Medium") return "pill pill-warn";
  if (risk === "Low") return "pill pill-ok";
  return "pill pill-muted";
}

export default function SensorDetail() {
  const { code } = useParams();
  const navigate = useNavigate();

  const [sensor, setSensor] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // edit form state
  const [form, setForm] = useState({ status: "OFFLINE", location: "", purpose: "", is_active: false });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedAt, setSavedAt] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(
        `${API_BASE}/api/sensor-submissions/${encodeURIComponent(code)}`
      );
      if (!res.ok) {
        if (res.status === 404) throw new Error(`Sensor "${code}" not found.`);
        throw new Error(`Failed to load sensor (HTTP ${res.status})`);
      }
      const data = await res.json();
      setSensor(data);
      setForm({
        status: data.status || "OFFLINE",
        location: data.location || "",
        purpose: data.purpose || "",
        is_active: !!data.is_active,
      });

      // Best-effort prediction
      try {
        const pr = await fetch(
          `${API_BASE}/corrosion/predict/${encodeURIComponent(code)}`
        );
        if (pr.ok) setPrediction(await pr.json());
        else setPrediction(null);
      } catch {
        setPrediction(null);
      }
    } catch (e) {
      setLoadError(e.message || "Failed to load sensor");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!sensor) return false;
    return (
      form.status !== sensor.status ||
      form.location !== (sensor.location || "") ||
      form.purpose !== (sensor.purpose || "") ||
      form.is_active !== !!sensor.is_active
    );
  }, [form, sensor]);

  const risk = useMemo(
    () => (sensor ? riskFrom(sensor, prediction?.probability ?? null) : null),
    [sensor, prediction]
  );

  function handleField(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
    setSavedAt(null);
  }

  async function handleSave(e) {
    e?.preventDefault?.();
    if (!dirty || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const payload = {
        status: form.status,
        location: form.location.trim(),
        purpose: form.purpose.trim() || null,
        is_active: form.is_active,
      };
      const res = await fetch(
        `${API_BASE}/api/sensor-submissions/${encodeURIComponent(code)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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
      const updated = await res.json();
      setSensor(updated);
      setForm({
        status: updated.status || "OFFLINE",
        location: updated.location || "",
        purpose: updated.purpose || "",
        is_active: !!updated.is_active,
      });
      setSavedAt(new Date());
    } catch (err) {
      setSaveError(err.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (!sensor) return;
    setForm({
      status: sensor.status || "OFFLINE",
      location: sensor.location || "",
      purpose: sensor.purpose || "",
      is_active: !!sensor.is_active,
    });
    setSaveError("");
    setSavedAt(null);
  }

  async function handleDelete() {
    const ok = window.confirm(
      `Delete sensor "${code}"? This will also remove its readings.`
    );
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/sensor-submissions/${encodeURIComponent(code)}`,
        { method: "DELETE" }
      );
      if (!res.ok && res.status !== 204) {
        throw new Error(`Delete failed (HTTP ${res.status})`);
      }
      navigate("/sensors");
    } catch (err) {
      alert(err.message || "Failed to delete sensor.");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <>
        <header className="topbar">
          <div>
            <div className="crumbs">Sensors / Loading…</div>
            <h1 className="title">Loading sensor…</h1>
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

  if (loadError || !sensor) {
    return (
      <>
        <header className="topbar">
          <div>
            <div className="crumbs">Sensors / Not Found</div>
            <h1 className="title">Sensor not available</h1>
          </div>
          <div className="topbarRight">
            <button className="btnGhost" type="button" onClick={() => navigate("/sensors")}>
              <Icon.ArrowLeft />
              <span>Back to Sensors</span>
            </button>
          </div>
        </header>
        <div className="errorBanner" role="alert">
          <Icon.AlertCircle />
          <span>{loadError || "Sensor data is unavailable."}</span>
        </div>
      </>
    );
  }

  const statusDisplay = titleCaseStatus(sensor.status);
  const probPct =
    prediction?.probability != null
      ? `${(prediction.probability * 100).toFixed(1)}%`
      : "—";

  return (
    <>
      <header className="topbar">
        <div>
          <div className="crumbs">Sensors / {sensor.sensor_code}</div>
          <h1 className="title">{sensor.name}</h1>
        </div>
        <div className="topbarRight">
          <button
            className="btnGhost"
            type="button"
            onClick={() => navigate("/sensors")}
          >
            <Icon.ArrowLeft />
            <span>Back</span>
          </button>
          <button
            className="btnDanger"
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            title="Delete sensor"
          >
            {deleting ? (
              <span className="spinner spinnerDark" aria-hidden="true" />
            ) : (
              <Icon.Trash />
            )}
            <span>{deleting ? "Deleting" : "Delete"}</span>
          </button>
        </div>
      </header>

      {/* Summary card */}
      <section className="card">
        <div className="detailGrid">
          <div className="detailField">
            <div className="metaLabel">Sensor Code</div>
            <div className="metaValue">
              <span className="sensorRowCode" style={{ marginLeft: 0 }}>
                {sensor.sensor_code}
              </span>
            </div>
          </div>
          <div className="detailField">
            <div className="metaLabel">Status</div>
            <div className="metaValue">
              <span className={statusPillClass(statusDisplay)}>
                {statusDisplay}
              </span>
            </div>
          </div>
          <div className="detailField">
            <div className="metaLabel">Risk</div>
            <div className="metaValue">
              <span className={riskPillClass(risk)}>{risk || "—"}</span>
            </div>
          </div>
          <div className="detailField">
            <div className="metaLabel">Active</div>
            <div className="metaValue">
              <span className={"pill " + (sensor.is_active ? "pill-ok" : "pill-muted")}>
                {sensor.is_active ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
          <div className="detailField">
            <div className="metaLabel">Last Seen</div>
            <div className="metaValue">{formatLastSeen(sensor.last_seen_at)}</div>
            <div className="metaSub">{formatDateTime(sensor.last_seen_at)}</div>
          </div>
          <div className="detailField">
            <div className="metaLabel">Model Confidence</div>
            <div className="metaValue">{probPct}</div>
            <div className="metaSub">corrosion probability</div>
          </div>
          <div className="detailField">
            <div className="metaLabel">Created</div>
            <div className="metaValue">{formatDateTime(sensor.created_at)}</div>
          </div>
          <div className="detailField">
            <div className="metaLabel">Updated</div>
            <div className="metaValue">{formatDateTime(sensor.updated_at)}</div>
          </div>
        </div>
      </section>

      {/* Edit card */}
      <section className="card">
        <div className="cardHeader">
          <h2 className="cardTitle">
            <Icon.Sensor />
            Edit Sensor
          </h2>
          {savedAt && (
            <span className="pill pill-ok">
              <Icon.CheckCircle width={12} height={12} />
              Saved {savedAt.toLocaleTimeString()}
            </span>
          )}
        </div>

        {saveError && (
          <div className="errorBanner" role="alert" style={{ marginBottom: 14 }}>
            <Icon.AlertCircle />
            <span>
              <b>Couldn't save changes.</b> {saveError}
            </span>
          </div>
        )}

        <form onSubmit={handleSave} className="formStack">
          <div className="formField">
            <label className="formLabel" htmlFor="status">
              Status
            </label>
            <select
              id="status"
              className="select"
              value={form.status}
              onChange={(e) => handleField("status", e.target.value)}
            >
              <option value="ONLINE">Online</option>
              <option value="WARNING">Warning</option>
              <option value="OFFLINE">Offline</option>
            </select>
            <span className="formHint">
              Manual override of the connection status.
            </span>
          </div>

          <div className="formField">
            <label className="formLabel" htmlFor="location">
              Location
            </label>
            <input
              id="location"
              className="input"
              value={form.location}
              onChange={(e) => handleField("location", e.target.value)}
              placeholder="e.g. Building 12, North Wall"
              required
            />
          </div>

          <div className="formField">
            <label className="formLabel" htmlFor="purpose">
              Purpose <span className="muted">(optional)</span>
            </label>
            <input
              id="purpose"
              className="input"
              value={form.purpose}
              onChange={(e) => handleField("purpose", e.target.value)}
              placeholder="e.g. Sheet Metal monitoring"
            />
          </div>

          <div className="formField">
            <label
              className="formLabel"
              htmlFor="is_active"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}
            >
              <input
                id="is_active"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => handleField("is_active", e.target.checked)}
              />
              Mark sensor as active
            </label>
          </div>

          <div className="formActions">
            <button
              className={"btn" + (saving ? " is-loading" : "")}
              type="submit"
              disabled={!dirty || saving}
              title={!dirty ? "No changes to save" : "Save changes"}
            >
              {saving ? (
                <span className="spinner" aria-hidden="true" />
              ) : (
                <Icon.CheckCircle />
              )}
              <span className="btnText">{saving ? "Saving" : "Save changes"}</span>
            </button>

            <button
              type="button"
              className="btnGhost"
              onClick={handleReset}
              disabled={!dirty || saving}
            >
              Reset
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

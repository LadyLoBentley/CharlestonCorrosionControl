import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icons.jsx";

const API_BASE = "http://127.0.0.1:8001";

export default function SensorForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetLocation = searchParams.get("location") || "";

  const [sensor, setSensor] = useState({
    sensor_code: "",
    name: "",
    purpose: "",
    location: presetLocation,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function handleChange(e) {
    const { name, value } = e.target;
    setSensor((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/api/sensor-submissions/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sensor_code: sensor.sensor_code.trim(),
          name: sensor.name.trim(),
          purpose: sensor.purpose.trim() || null,
          location: sensor.location.trim(),
        }),
      });

      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
          const body = await response.json();
          if (body?.detail) detail = body.detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }

      navigate("/sensors");
    } catch (err) {
      setError(err.message || "Failed to create sensor");
    } finally {
      setSubmitting(false);
    }
  }

  const cameFromLocation = !!presetLocation;

  return (
    <>
      <header className="topbar">
        <div>
          <div className="crumbs">
            {cameFromLocation
              ? `Locations / ${presetLocation} / Add Sensor`
              : "Sensors / Add Sensor"}
          </div>
          <h1 className="title">Add Sensor</h1>
        </div>
        <div className="topbarRight">
          <button
            className="btnGhost"
            type="button"
            onClick={() =>
              navigate(
                cameFromLocation
                  ? `/locations/${encodeURIComponent(presetLocation)}`
                  : "/sensors"
              )
            }
          >
            <Icon.ArrowLeft />
            <span>{cameFromLocation ? "Back to Location" : "Back to Sensors"}</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="errorBanner" role="alert">
          <Icon.AlertCircle />
          <span>
            <b>Couldn't create sensor.</b> {error}
          </span>
        </div>
      )}

      <section className="card">
        <div className="cardHeader">
          <h2 className="cardTitle">
            <Icon.Sensor />
            New Sensor Details
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="formStack">
          <div className="formField">
            <label className="formLabel" htmlFor="sensor_code">
              Sensor Code
            </label>
            <input
              id="sensor_code"
              className="input"
              placeholder="e.g. CHS-001"
              name="sensor_code"
              value={sensor.sensor_code}
              onChange={handleChange}
              required
              autoFocus
            />
            <span className="formHint">Unique identifier for this sensor.</span>
          </div>

          <div className="formField">
            <label className="formLabel" htmlFor="name">
              Sensor Name
            </label>
            <input
              id="name"
              className="input"
              placeholder="e.g. Pier 4 Roof Coupon"
              name="name"
              value={sensor.name}
              onChange={handleChange}
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
              placeholder="e.g. Sheet Metal monitoring"
              name="purpose"
              value={sensor.purpose}
              onChange={handleChange}
            />
          </div>

          <div className="formField">
            <label className="formLabel" htmlFor="location">
              Location
            </label>
            <input
              id="location"
              className="input"
              placeholder="e.g. Building 12, North Wall"
              name="location"
              value={sensor.location}
              onChange={handleChange}
              required
            />
            {cameFromLocation && (
              <span className="formHint">
                Pre-filled from <b>{presetLocation}</b>. You can change it.
              </span>
            )}
          </div>

          <div className="formActions">
            <button
              className={"btn" + (submitting ? " is-loading" : "")}
              type="submit"
              disabled={submitting}
            >
              {submitting ? (
                <span className="spinner" aria-hidden="true" />
              ) : (
                <Icon.Plus />
              )}
              <span className="btnText">
                {submitting ? "Creating" : "Create Sensor"}
              </span>
            </button>

            <button
              type="button"
              className="btnGhost"
              onClick={() => navigate("/sensors")}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function SensorForm() {

  const navigate = useNavigate();

  const [sensor, setSensor] = useState({
    sensor_code: "",
    name: "",
    purpose: "",
    location: "",
    status: "OFFLINE",
    is_active: true
  });

  function handleChange(e) {
    const { name, value, type, checked } = e.target;

    setSensor((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    try {
      const response = await fetch("http://127.0.0.1:8000/api/sensors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(sensor)
      });

      if (!response.ok) {
        throw new Error("Failed to create sensor");
      }

      navigate("/sensors");

    } catch (err) {
      console.error(err);
      alert("Error creating sensor");
    }
  }

  return (
    <section className="card">

      <div className="cardHeader">
        <h2 className="cardTitle">Add Sensor</h2>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          maxWidth: 1500
        }}
      >

        <input
          className="select"
          placeholder="Sensor Code"
          name="sensor_code"
          value={sensor.sensor_code}
          onChange={handleChange}
          required
        />

        <input
          className="select"
          placeholder=" Sensor Name"
          name="name"
          value={sensor.name}
          onChange={handleChange}
          required
        />

        <input
          className="select"
          placeholder="Purpose"
          name="purpose"
          value={sensor.purpose}
          onChange={handleChange}
        />

        <input
          className="select"
          placeholder="Location"
          name="location"
          value={sensor.location}
          onChange={handleChange}
          required
        />

        <select
          className="select"
          name="status"
          value={sensor.status}
          onChange={handleChange}
        >
          <option value="OFFLINE">Offline</option>
          <option value="ONLINE">Online</option>
          <option value="WARNING">Warning</option>
        </select>

        <label style={{ display: "flex", gap: 8 }}>
          <input
            type="checkbox"
            name="is_active"
            checked={sensor.is_active}
            onChange={handleChange}
          />
          Active Sensor
        </label>

        <div style={{ display: "flex", gap: 10 }}>

          <button className="primaryBtn" type="submit">
            Create Sensor
          </button>

          <button
            type="button"
            className="secondaryBtn"
            onClick={() => navigate("/sensors")}
          >
            Cancel
          </button>

        </div>

      </form>

    </section>
  );
}
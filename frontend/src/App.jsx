import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./layout.jsx";
import Dashboard from "./pages/dashboard.jsx";
import Sensors from "./pages/sensors.jsx"; // or assets.jsx if you keep that name
import SensorForm from "./pages/SensorForm.jsx";
import Locations from "./pages/Locations.jsx";

export default function App() {
  return (
    <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="sensors" element={<Sensors />} />
          <Route path="sensors/new" element={<SensorForm />} />
            <Route path="locations" element={<Locations />} />
      </Route>
    </Routes>
  );
}

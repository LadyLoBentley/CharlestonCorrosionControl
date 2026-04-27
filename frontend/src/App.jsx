import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./layout.jsx";
import Dashboard from "./pages/dashboard.jsx";
import Sensors from "./pages/sensors.jsx";
import SensorForm from "./pages/SensorForm.jsx";
import SensorDetail from "./pages/SensorDetail.jsx";
import Locations from "./pages/Locations.jsx";
import LocationDetail from "./pages/LocationDetail.jsx";
import Activity from "./pages/Activity.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="sensors" element={<Sensors />} />
        <Route path="sensors/new" element={<SensorForm />} />
        <Route path="sensors/:code" element={<SensorDetail />} />
        <Route path="locations" element={<Locations />} />
        <Route path="locations/:name" element={<LocationDetail />} />
        <Route path="activity" element={<Activity />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

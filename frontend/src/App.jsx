import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./layout.jsx";
import Dashboard from "./pages/dashboard.jsx";
import Sensors from "./pages/sensors.jsx"; // or assets.jsx if you keep that name

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="sensors" element={<Sensors />} />
      </Route>
    </Routes>
  );
}

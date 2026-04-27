import { Outlet, NavLink } from "react-router-dom";
import { Icon } from "./components/Icons.jsx";

export default function Layout() {
  const navClass = ({ isActive }) => "navItem" + (isActive ? " active" : "");

  return (
    <div className="page">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark" aria-hidden="true">
            CC
          </div>
          <div>
            <div className="brandName">Charleston Corrosion</div>
            <div className="brandSub">Monitoring Platform</div>
          </div>
        </div>

        <nav className="nav" aria-label="Primary">
          <div className="navGroup">Overview</div>

          <NavLink className={navClass} to="/dashboard" end>
            <Icon.Home />
            <span>Dashboard</span>
          </NavLink>

          <NavLink className={navClass} to="/sensors">
            <Icon.Sensor />
            <span>Sensors</span>
          </NavLink>

          <NavLink className={navClass} to="/locations">
            <Icon.MapPin />
            <span>Locations</span>
          </NavLink>

          <NavLink className={navClass} to="/activity">
            <Icon.Activity />
            <span>Activity</span>
          </NavLink>

          <NavLink className={navClass} to="/sensors/new">
            <Icon.Plus />
            <span>Add Sensor</span>
          </NavLink>
        </nav>

        <div className="sidebarFooter">
          <div className="chip">
            <span className="dot" aria-hidden="true" />
            <span>Live</span>
          </div>
          <div className="muted">v0.2</div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

import { Outlet, NavLink } from "react-router-dom";

export default function Layout() {
  const navClass = ({ isActive }) => "navItem" + (isActive ? " active" : "");

  return (
    <div className="page">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark" aria-hidden="true" />
          <div>
            <div className="brandName">Charleston Corrosion Control</div>
            <div className="brandSub">Dashboard</div>
          </div>
        </div>

        <nav className="nav">
          <div className="navGroup">Overview</div>

          <NavLink className={navClass} to="/dashboard">
            Home
          </NavLink>

          <NavLink className={navClass} to="/sensors">
            Assets
          </NavLink>
        </nav>

        <div className="sidebarFooter">
          <div className="chip">
            <span className="dot" />
            <span>Live</span>
          </div>
          <div className="muted">v0.1 demo</div>
        </div>
      </aside>

      {/* MAIN CONTENT RENDERED HERE */}
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

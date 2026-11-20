import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../api";

export default function TopBar() {
  const { me, refresh } = useAuth();
  const navigate = useNavigate();

  async function logout() {
    await api.logout();
    await refresh();
    navigate("/login");
  }

  return (
    <div className="topbar">
      <Link to="/" className="topbar-brand">
        <img src="/brand/rocket-mz1.svg" alt="" />
        <span className="brand">ADOLAR SCROBBLER</span>
      </Link>
      <div className="nav-links">
        {me && (
          <>
            <NavLink to="/" end>
              Dashboard
            </NavLink>
            <NavLink to={`/u/${me.username}`}>Mein Profil</NavLink>
            <NavLink to={`/u/${me.username}/loved`}>Lieblingstracks</NavLink>
            <NavLink to="/leaderboard">Leaderboard</NavLink>
            <NavLink to="/settings">Einstellungen</NavLink>
            <button className="btn btn-ghost" onClick={logout}>
              Logout
            </button>
          </>
        )}
      </div>
    </div>
  );
}

import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import TopBar from "./components/TopBar";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import Leaderboard from "./pages/Leaderboard";
import LovedTracks from "./pages/LovedTracks";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return null;
  if (!me) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Home() {
  const { me } = useAuth();
  if (!me) return null;
  return <Navigate to={`/u/${me.username}`} replace />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <TopBar />
      {children}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Shell>
                <Home />
              </Shell>
            </RequireAuth>
          }
        />
        <Route
          path="/u/:username"
          element={
            <RequireAuth>
              <Shell>
                <Profile />
              </Shell>
            </RequireAuth>
          }
        />
        <Route
          path="/u/:username/loved"
          element={
            <RequireAuth>
              <Shell>
                <LovedTracks />
              </Shell>
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <Shell>
                <Settings />
              </Shell>
            </RequireAuth>
          }
        />
        <Route
          path="/leaderboard"
          element={
            <RequireAuth>
              <Shell>
                <Leaderboard />
              </Shell>
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  );
}

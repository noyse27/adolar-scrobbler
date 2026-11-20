import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

export default function Register() {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.register(username, password, displayName || undefined);
      await refresh();
      navigate("/");
    } catch (err: any) {
      setError(
        err.message === "username_taken"
          ? "Benutzername ist bereits vergeben."
          : err.message === "password_too_short"
          ? "Passwort muss mindestens 8 Zeichen haben."
          : err.message === "registration_disabled"
          ? "Registrierung ist auf dieser Instanz deaktiviert."
          : "Registrierung fehlgeschlagen."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <img src="/brand/rocket-mz1.svg" alt="" height={72} />
      <h1 className="brand">ADOLAR SCROBBLER</h1>
      <p className="muted">Neuen Account anlegen.</p>
      <form onSubmit={submit}>
        <input
          placeholder="Benutzername"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
        <input
          placeholder="Anzeigename (optional)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <input
          placeholder="Passwort (min. 8 Zeichen)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="error-text">{error}</div>}
        <button className="btn" type="submit" disabled={busy}>
          Account erstellen
        </button>
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        Schon registriert? <Link to="/login">Einloggen</Link>
      </p>
    </div>
  );
}

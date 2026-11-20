import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [registration, setRegistration] = useState<{ bootstrap: boolean; open: boolean } | null>(
    null
  );
  const navigate = useNavigate();
  const { refresh } = useAuth();

  useEffect(() => {
    api.registrationOpen().then(setRegistration);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(username, password);
      await refresh();
      navigate("/");
    } catch (err: any) {
      setError("Login fehlgeschlagen. Benutzername oder Passwort falsch.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <img src="/brand/rocket-mz1.svg" alt="" height={72} />
      <h1 className="brand">ADOLAR SCROBBLER</h1>
      <p className="muted">Dein eigener Last.fm-Klon für das Adolar-Universum.</p>
      {registration?.bootstrap && (
        <p className="pill" style={{ marginBottom: 8 }}>
          Diese Instanz hat noch keinen Admin — <Link to="/register">jetzt einrichten</Link>
        </p>
      )}
      <form onSubmit={submit}>
        <input
          placeholder="Benutzername"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
        <input
          placeholder="Passwort"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="error-text">{error}</div>}
        <button className="btn" type="submit" disabled={busy}>
          Einloggen
        </button>
      </form>
      {(registration?.bootstrap || registration?.open) && (
        <p className="muted" style={{ marginTop: 16 }}>
          Noch keinen Account? <Link to="/register">Registrieren</Link>
        </p>
      )}
      {registration && !registration.bootstrap && !registration.open && (
        <p className="muted" style={{ marginTop: 16 }}>
          Registrierung ist geschlossen — du brauchst einen Einladungslink von einem Admin.
        </p>
      )}
    </div>
  );
}

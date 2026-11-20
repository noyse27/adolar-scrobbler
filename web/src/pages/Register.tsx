import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

export default function Register() {
  const [params] = useSearchParams();
  const inviteToken = params.get("invite") ?? undefined;

  const [status, setStatus] = useState<{
    bootstrap: boolean;
    requiresSetupToken: boolean;
    open: boolean;
  } | null>(null);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  useEffect(() => {
    api.registrationOpen().then(setStatus);
  }, []);

  const canRegister = !status || status.bootstrap || status.open || Boolean(inviteToken);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.register({
        username,
        password,
        displayName: displayName || undefined,
        setupToken: status?.requiresSetupToken ? setupToken : undefined,
        inviteToken,
      });
      await refresh();
      navigate("/");
    } catch (err: any) {
      setError(
        err.message === "username_taken"
          ? "Benutzername ist bereits vergeben."
          : err.message === "password_too_short"
          ? "Passwort muss mindestens 8 Zeichen haben."
          : err.message === "registration_closed"
          ? "Registrierung ist auf dieser Instanz geschlossen. Du brauchst einen Einladungslink von einem Admin."
          : err.message === "invalid_invite"
          ? "Dieser Einladungslink ist ungültig, abgelaufen oder bereits aufgebraucht."
          : err.message === "invalid_setup_token"
          ? "Falsches Setup-Token."
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

      {status?.bootstrap && (
        <p className="pill" style={{ marginBottom: 8 }}>
          Ersteinrichtung: dieser Account wird Admin
        </p>
      )}
      {!status?.bootstrap && inviteToken && (
        <p className="pill" style={{ marginBottom: 8 }}>
          Du registrierst dich mit einem Einladungslink
        </p>
      )}
      <p className="muted">Neuen Account anlegen.</p>

      {status && !canRegister ? (
        <div className="card" style={{ marginTop: 20, textAlign: "left" }}>
          <p className="error-text">
            Die Registrierung ist auf dieser Instanz geschlossen. Frag einen Admin nach einem
            Einladungslink.
          </p>
        </div>
      ) : (
        <form onSubmit={submit}>
          {status?.requiresSetupToken && (
            <input
              placeholder="Setup-Token (aus setup.sh / .env)"
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
            />
          )}
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
      )}

      <p className="muted" style={{ marginTop: 16 }}>
        Schon registriert? <Link to="/login">Einloggen</Link>
      </p>
    </div>
  );
}

import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";
import { api } from "../api";

function ImportPanel() {
  const [lastfmUsername, setLastfmUsername] = useState("");
  const [job, setJob] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  async function checkExisting() {
    const jobs = (await api.importJobs()) as any[];
    const running = jobs.find((j) => j.status === "RUNNING" || j.status === "PENDING");
    if (running) startPolling(running.id);
    else if (jobs[0]) setJob(jobs[0]);
  }

  useEffect(() => {
    checkExisting();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  function startPolling(id: string) {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      const j = await api.importJob(id);
      setJob(j);
      if ((j as any).status === "DONE" || (j as any).status === "FAILED") {
        window.clearInterval(pollRef.current!);
      }
    }, 1500);
  }

  async function startImport() {
    setError(null);
    try {
      const j = await api.startImport(lastfmUsername);
      setJob(j);
      startPolling((j as any).id);
    } catch (err: any) {
      setError(
        err.message === "import_already_running"
          ? "Es läuft bereits ein Import."
          : "Import konnte nicht gestartet werden. Hat der Admin den last.fm API-Key hinterlegt?"
      );
    }
  }

  const running = job && (job.status === "RUNNING" || job.status === "PENDING");
  const progress =
    job?.totalPages ? Math.min(100, Math.round((job.processedPages / job.totalPages) * 100)) : 0;

  return (
    <div className="card">
      <h3>Von last.fm importieren</h3>
      <p className="muted">
        Trage deinen last.fm-Benutzernamen ein. Dein kompletter öffentlicher Scrobble-Verlauf wird
        importiert (mehrfacher Import ist sicher, Duplikate werden übersprungen).
      </p>
      <div className="row" style={{ marginTop: 12 }}>
        <input
          placeholder="last.fm Benutzername"
          value={lastfmUsername}
          onChange={(e) => setLastfmUsername(e.target.value)}
          disabled={!!running}
        />
        <button className="btn" onClick={startImport} disabled={!!running || !lastfmUsername}>
          {running ? <span className="rocket-spin">🚀</span> : "Import starten"}
        </button>
      </div>
      {error && <div className="error-text" style={{ marginTop: 10 }}>{error}</div>}
      {job && (
        <div style={{ marginTop: 16 }}>
          <div className="muted">
            Status: <strong>{job.status}</strong>
            {job.totalPages ? ` · Seite ${job.processedPages}/${job.totalPages}` : ""}
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 999,
              background: "var(--bg-elevated)",
              marginTop: 8,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${running ? progress : job.status === "DONE" ? 100 : 0}%`,
                background: "linear-gradient(135deg, var(--violet), var(--cyan))",
                transition: "width 400ms ease",
              }}
            />
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            {job.importedCount} importiert · {job.skippedCount} übersprungen
            {job.error ? ` · Fehler: ${job.error}` : ""}
          </div>
        </div>
      )}
    </div>
  );
}

function AdminPanel() {
  const [settings, setSettings] = useState<any>(null);
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.adminSettings().then(setSettings).catch(() => setSettings(null));
  }, []);

  if (!settings) return null;

  async function save() {
    await api.setLastfmKey(key);
    setSaved(true);
    setSettings(await api.adminSettings());
  }

  return (
    <div className="card">
      <h3>Instanz-Einstellungen (Admin)</h3>
      <p className="muted">
        Für den last.fm-Import braucht diese Instanz einmalig einen last.fm API-Key (kostenlos unter{" "}
        <a href="https://www.last.fm/api/account/create" target="_blank" rel="noreferrer">
          last.fm/api/account/create
        </a>
        ). Danach können alle Benutzer importieren, ohne selbst einen Key zu brauchen.
      </p>
      <p className="muted">
        last.fm API-Key: {settings.lastfmApiKeyConfigured ? "✅ konfiguriert" : "❌ nicht gesetzt"}
      </p>
      <div className="row" style={{ marginTop: 10 }}>
        <input placeholder="last.fm API-Key" value={key} onChange={(e) => setKey(e.target.value)} />
        <button className="btn" onClick={save} disabled={!key}>
          Speichern
        </button>
      </div>
      {saved && <p className="muted">Gespeichert.</p>}
      <p className="muted" style={{ marginTop: 14 }}>
        App-API-Key dieser Instanz (für last.fm-kompatible Scrobbler-Clients):{" "}
        <code>{settings.appApiKey}</code>
      </p>
    </div>
  );
}

export default function Settings() {
  const { me } = useAuth();
  if (!me) return null;

  const scrobblerUrl = `${window.location.origin}`;

  return (
    <div className="grid" style={{ gap: 20 }}>
      <h2>Einstellungen</h2>

      <div className="card">
        <h3>Scrobbler-Client einrichten</h3>
        <p className="muted">
          Für Clients, die das last.fm-API-2.0-Protokoll sprechen (API-Root konfigurierbar):
        </p>
        <ul className="muted">
          <li>API-Root: <code>{scrobblerUrl}/2.0/</code></li>
          <li>Benutzername: <code>{me.username}</code></li>
          <li>Session Key: <code>{me.sessionKey}</code></li>
        </ul>
        <p className="muted">
          Für Clients mit dem alten Audioscrobbler-1.2-Protokoll (z.B. foobar2000, mpdscribble):
          Handshake-URL <code>{scrobblerUrl}/legacy/</code>, Benutzername + dein Passwort.
        </p>
      </div>

      <ImportPanel />

      {me.role === "ADMIN" && <AdminPanel />}
    </div>
  );
}

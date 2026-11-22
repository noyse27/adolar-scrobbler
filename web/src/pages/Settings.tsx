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

  // Scrobbles import first, then loved tracks - same job, two phases.
  const scrobblesDone = Boolean(job?.totalPages) && job.processedPages >= job.totalPages;
  const scrobblesProgress = job?.totalPages
    ? Math.min(100, Math.round((job.processedPages / job.totalPages) * 100))
    : 0;
  const lovedProgress = job?.lovedTotalPages
    ? Math.min(100, Math.round((job.lovedProcessedPages / job.lovedTotalPages) * 100))
    : 0;
  const overallProgress = job?.status === "DONE" ? 100 : scrobblesDone ? lovedProgress : scrobblesProgress;

  return (
    <div className="card">
      <h3>Von last.fm importieren</h3>
      <p className="muted">
        Trage deinen last.fm-Benutzernamen ein. Dein kompletter öffentlicher Scrobble-Verlauf und
        deine Loved-Tracks werden importiert (mehrfacher Import ist sicher, Duplikate werden
        übersprungen).
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
            {running ? (scrobblesDone ? " · Phase: Loved-Tracks" : " · Phase: Scrobbles") : ""}
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
                width: `${overallProgress}%`,
                background: "linear-gradient(135deg, var(--violet), var(--cyan))",
                transition: "width 400ms ease",
              }}
            />
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            Scrobbles: {job.importedCount} importiert · {job.skippedCount} übersprungen
            {job.totalPages ? ` (Seite ${job.processedPages}/${job.totalPages})` : ""}
          </div>
          <div className="muted" style={{ marginTop: 2 }}>
            Loved-Tracks: {job.lovedImportedCount} importiert · {job.lovedSkippedCount} übersprungen
            {job.lovedTotalPages ? ` (Seite ${job.lovedProcessedPages}/${job.lovedTotalPages})` : ""}
          </div>
          {job.error && <div className="error-text" style={{ marginTop: 6 }}>Fehler: {job.error}</div>}
        </div>
      )}
    </div>
  );
}

function AdminPanel() {
  const [settings, setSettings] = useState<any>(null);
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [musicBrainzContact, setMusicBrainzContact] = useState("");
  const [musicBrainzContactSaved, setMusicBrainzContactSaved] = useState(false);
  const [musicBrainzContactError, setMusicBrainzContactError] = useState<string | null>(null);

  useEffect(() => {
    api.adminSettings().then((value: any) => {
      setSettings(value);
      setMusicBrainzContact(value.musicBrainz.contact ?? "");
    }).catch(() => setSettings(null));
    api.musicBrainzCandidates().then(setCandidates).catch(() => setCandidates([]));
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

      <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "18px 0" }} />

      <h3>MusicBrainz-Metadaten</h3>
      <p className="muted">
        Status: {settings.musicBrainz.enabled ? "✅ Hintergrund-Anreicherung aktiv" : "⏸ deaktiviert"}
        {!settings.musicBrainz.contactConfigured && " · Kontakt fehlt"}
      </p>
      <p className="muted">
        Eine HTTPS-Kontaktseite oder E-Mail-Adresse wird ausschließlich im User-Agent an
        MusicBrainz übertragen. Eine Projekt-URL ist aus Datenschutzgründen empfehlenswert.
      </p>
      <div className="row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        <input
          type="text"
          style={{ minWidth: 300, flex: 1 }}
          placeholder="https://example.com/kontakt oder admin@example.com"
          value={musicBrainzContact}
          onChange={(event) => {
            setMusicBrainzContact(event.target.value);
            setMusicBrainzContactSaved(false);
            setMusicBrainzContactError(null);
          }}
        />
        <button className="btn" disabled={!musicBrainzContact.trim()} onClick={async () => {
          try {
            await api.setMusicBrainzContact(musicBrainzContact);
            setMusicBrainzContactSaved(true);
            setMusicBrainzContactError(null);
            setSettings(await api.adminSettings());
          } catch {
            setMusicBrainzContactError("Bitte eine gültige E-Mail-Adresse oder HTTPS-URL eingeben.");
          }
        }}>Kontakt speichern</button>
      </div>
      {musicBrainzContactSaved && <p className="muted">MusicBrainz-Kontakt gespeichert.</p>}
      {musicBrainzContactError && <p className="error-text">{musicBrainzContactError}</p>}
      <p className="muted">
        {settings.musicBrainz.enrichedTracks} Tracks zugeordnet · {settings.musicBrainz.cachedCovers} Covers lokal gecacht
      </p>
      <p className="muted">
        Wartend: {(settings.musicBrainz.jobs.PENDING ?? 0) + (settings.musicBrainz.jobs.RETRY ?? 0)} ·
        Ohne Treffer: {settings.musicBrainz.jobs.NO_MATCH ?? 0} ·
        Fehlgeschlagen: {settings.musicBrainz.jobs.FAILED ?? 0}
      </p>
      <button
        className="btn btn-ghost"
        onClick={async () => {
          await api.retryMusicBrainz();
          setSettings(await api.adminSettings());
        }}
      >
        Fehlende Metadaten erneut versuchen
      </button>
      {candidates.length > 0 && (
        <div className="candidate-list">
          <h3>Unsichere Zuordnungen</h3>
          <p className="muted">Bitte nur auswählen, wenn Titel, Künstler und Veröffentlichung zusammenpassen.</p>
          {candidates.map((job) => (
            <div className="candidate-job" key={job.id}>
              <strong>{job.artist} – {job.track}</strong>
              {job.album && <span className="muted"> · {job.album}</span>}
              {(job.candidates ?? []).map((candidate: any) => (
                <div className="candidate-row" key={candidate.id}>
                  <div>
                    <div>{candidate.artists.join(" & ")} – {candidate.title}</div>
                    <div className="muted">
                      {candidate.releases.join(", ") || "Keine Veröffentlichung angegeben"}
                      {candidate.disambiguation ? ` · ${candidate.disambiguation}` : ""} · Treffer {candidate.score}%
                    </div>
                  </div>
                  <button className="btn btn-ghost" onClick={async () => {
                    await api.selectMusicBrainzCandidate(job.id, candidate.id);
                    setCandidates((rows) => rows.filter((row) => row.id !== job.id));
                  }}>Auswählen</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "18px 0" }} />

      <h3>App-Zugangsdaten (für last.fm-kompatible Scrobbler-Clients)</h3>
      <p className="muted">
        Diese Instanz tritt gegenüber anderen Apps wie eine registrierte last.fm-API-Anwendung
        auf. Trägst du API-Key + Secret z.B. in Adolar (Web) oder Adolar Next ein, können diese
        hierher scrobbeln — zusätzlich oder statt zu last.fm.
      </p>
      <p className="muted">
        API-Key: <code>{settings.appApiKey}</code>
      </p>
      <p className="muted">
        Secret:{" "}
        {showSecret ? (
          <code>{settings.appSecret}</code>
        ) : (
          <button className="btn btn-ghost" onClick={() => setShowSecret(true)} style={{ padding: "2px 10px" }}>
            anzeigen
          </button>
        )}
      </p>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "18px 0" }} />

      <h3>Registrierung</h3>
      <p className="muted">
        Standardmäßig ist die offene Registrierung deaktiviert. Benutzer können sich entweder über
        einen Einladungslink anmelden, oder — wenn hier aktiviert — frei über das Login-Fenster.
      </p>
      <label className="row" style={{ cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={settings.allowRegistration}
          onChange={async (e) => {
            await api.setAllowRegistration(e.target.checked);
            setSettings(await api.adminSettings());
          }}
        />
        Registrierung über das Login-Fenster erlauben
      </label>
    </div>
  );
}

function InvitesPanel() {
  const [invites, setInvites] = useState<any[]>([]);
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInHours, setExpiresInHours] = useState<number | "">("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function refresh() {
    setInvites(await api.invites());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function create() {
    await api.createInvite({
      maxUses,
      expiresInHours: expiresInHours === "" ? undefined : Number(expiresInHours),
    });
    await refresh();
  }

  async function revoke(id: string) {
    await api.revokeInvite(id);
    await refresh();
  }

  function inviteUrl(token: string) {
    return `${window.location.origin}/register?invite=${token}`;
  }

  async function copy(invite: any) {
    try {
      await navigator.clipboard.writeText(inviteUrl(invite.token));
      setCopiedId(invite.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // clipboard API unavailable (e.g. insecure context) — link is still shown as text
    }
  }

  return (
    <div className="card">
      <h3>Einladungslinks</h3>
      <p className="muted">
        Ein Einladungslink erlaubt eine Registrierung, auch wenn die offene Registrierung oben
        deaktiviert ist.
      </p>
      <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
        <input
          type="number"
          min={1}
          style={{ width: 90 }}
          value={maxUses}
          onChange={(e) => setMaxUses(Math.max(1, Number(e.target.value)))}
          title="Maximale Nutzungen"
        />
        <span className="muted">x nutzbar,</span>
        <input
          type="number"
          min={1}
          placeholder="läuft nie ab"
          style={{ width: 140 }}
          value={expiresInHours}
          onChange={(e) => setExpiresInHours(e.target.value === "" ? "" : Number(e.target.value))}
          title="Gültigkeit in Stunden"
        />
        <span className="muted">Stunden gültig</span>
        <button className="btn" onClick={create}>
          Link erstellen
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        {invites.length === 0 && <p className="muted">Noch keine Einladungslinks.</p>}
        {invites.map((i) => {
          const expired = i.expiresAt && new Date(i.expiresAt) < new Date();
          const exhausted = i.usedCount >= i.maxUses;
          const inactive = i.revoked || expired || exhausted;
          return (
            <div className="track-row" key={i.id}>
              <div className="track-meta">
                <div className="track-name" style={{ opacity: inactive ? 0.5 : 1 }}>
                  {i.usedCount}/{i.maxUses} genutzt
                  {i.revoked ? " · widerrufen" : expired ? " · abgelaufen" : ""}
                </div>
                <div className="artist-name">
                  {i.registeredUsernames.length > 0
                    ? `registriert: ${i.registeredUsernames.join(", ")}`
                    : "noch niemand registriert"}
                </div>
              </div>
              <div className="row">
                {!inactive && (
                  <button className="btn btn-ghost" onClick={() => copy(i)}>
                    {copiedId === i.id ? "Kopiert ✓" : "Link kopieren"}
                  </button>
                )}
                {!i.revoked && (
                  <button className="btn btn-ghost" onClick={() => revoke(i.id)}>
                    Widerrufen
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
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

      {me.role === "ADMIN" && (
        <>
          <AdminPanel />
          <InvitesPanel />
        </>
      )}
    </div>
  );
}

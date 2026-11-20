# Adolar Scrobbler 🚀

Dein eigener, selbst gehosteter Scrobble-Server für das Adolar-Universum, protokollkompatibel
zu last.fm (so wie Libre.fm, GNU FM oder Maloja). Nimmt Scrobbles von jedem last.fm-kompatiblen
Client an, zeigt fancy Statistiken (Charts, Hör-Kalender, Hör-Uhr, Streaks, Musik-Diversität,
"an diesem Tag vor Jahren" ...), hat eine Love-Funktion und kann deinen kompletten Verlauf von
last.fm importieren.

Mit last.fm selbst hat das nichts zu tun — kein last.fm-Code, kein Branding, keine Daten von
last.fm außer dem, was du dir per offizieller API mit deinem eigenen Account/Key selbst holst.
Implementiert werden lediglich die offen dokumentierten Scrobbling-Protokolle (Audioscrobbler
1.2 und Web-Service 2.0), damit bestehende Scrobbler-Clients ohne Codeänderung auch gegen diese
Instanz laufen. Die Details stehen in [API.md](API.md).

## Features

- **Multi-User mit kontrollierter Registrierung**: der erste angelegte Account wird
  automatisch Admin (geschützt durch ein einmaliges, von `setup.sh` generiertes
  Setup-Token). Danach ist offene Registrierung standardmäßig **deaktiviert** — neue
  Accounts entstehen entweder über einen von einem Admin erzeugten Einladungslink,
  oder (falls ein Admin das in den Einstellungen erlaubt) frei über das Login-Fenster.
  Jeder hat ein eigenes Profil unter `/u/<name>`.
- **last.fm-kompatible API** (`/2.0/`): `auth.getToken`, `auth.getSession`,
  `auth.getMobileSession`, `track.scrobble` (auch Batch), `track.updateNowPlaying`,
  `track.love`/`track.unlove`, `user.getInfo`, `user.getRecentTracks`. Signierte Requests
  (`api_sig`) werden geprüft wie beim echten last.fm. Clients, die eine eigene API-Root
  konfigurieren lassen, laufen ohne Codeänderung gegen diese Instanz.
- **Legacy Audioscrobbler 1.2** (`/legacy/`): das alte Handshake-Protokoll, das viele
  ältere Scrobbler (foobar2000, mpdscribble, Rockbox, ...) sprechen.
- **Stats**: Top-Künstler/-Alben/-Tracks über verschiedene Zeiträume, Scrobble-Kalender
  (GitHub-Heatmap-Style), Hör-Uhr nach Tageszeit, aktueller/längster Streak,
  Musik-Diversitäts-Score (Shannon-Entropie über die Künstlerverteilung), Nachteulen-Score,
  "an diesem Tag vor Jahren", Top-Künstler-Anteil, instanzweites Leaderboard.
- **Love-Funktion**, direkt in der Timeline oder per API.
- **last.fm-Import**: pro Instanz einmalig last.fm-API-Key hinterlegen (Admin), danach
  kann jeder User per Button in den Einstellungen seinen kompletten last.fm-Verlauf
  importieren. Läuft als Hintergrund-Job mit Fortschrittsanzeige. Mehrfacher Import ist
  sicher — Duplikate werden erkannt und übersprungen. Alternativ gibt es ein CLI-Script.
- **Adolar-Branding**: Rakete, Orbitron-Font, Adolar-Farbpalette (Violett/Cyan/Flame-Orange),
  passt ins Adolar-Universum.

## Schnellstart (Docker)

```bash
./setup.sh
```

Legt beim ersten Lauf `.env` aus `.env.example` an und erzeugt `JWT_SECRET`,
`COOKIE_SECRET`, `POSTGRES_PASSWORD` und `SETUP_TOKEN` zufällig per `openssl rand -hex 32`
(schon gesetzte Werte werden nie überschrieben — erneutes Ausführen ist also sicher,
z.B. nach einem `git pull`), baut die Images und startet den Stack. Die App läuft
danach auf `http://localhost:4000` (Port über `HOST_PORT` in `.env` änderbar).

Am Ende gibt `setup.sh` das **Setup-Token** aus — gehe auf `/register` und gib es dort
ein, um den ersten Account (automatisch Admin) anzulegen. Danach hat das Token keine
Funktion mehr, und die offene Registrierung bleibt zu, bis du sie unter `/settings`
freischaltest oder Einladungslinks verteilst (siehe „Registrierung & Einladungen" unten).

Alternativ manuell:

```bash
cp .env.example .env
# JWT_SECRET, COOKIE_SECRET, POSTGRES_PASSWORD selbst setzen (z.B. openssl rand -hex 32)
docker compose up -d --build
```

## Deployment auf deinem Webserver

1. Repo auf den Server klonen.
2. `./setup.sh` ausführen (erzeugt `.env` mit Secrets und startet den Stack).
3. In `.env` noch `PUBLIC_URL=https://scrobbler.deine-domain.de` setzen und
   `docker compose up -d` erneut laufen lassen, damit es übernommen wird.
4. Reverse Proxy (nginx/Caddy/Traefik) auf Container-Port `4000` (bzw. den in
   `HOST_PORT` gewählten Host-Port) zeigen lassen, TLS terminieren.
5. Fertig. Datenbank-Daten liegen im Docker-Volume `db-data` — für Backups
   `docker compose exec db pg_dump -U adolar adolar_scrobbler > backup.sql`.

**Hinweis:** `POSTGRES_PASSWORD` wird nur beim allerersten Start eines frischen
Datenbank-Volumes wirksam. Änderst du es danach in `.env`, muss entweder Postgres'
Passwort selbst aktualisiert werden oder (nur wenn noch keine wichtigen Daten drin
sind) das Volume mit `docker compose down -v` neu angelegt werden.

Beispiel-nginx-Snippet:

```nginx
server {
    server_name scrobbler.deine-domain.de;
    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Registrierung & Einladungen

- **Erster Account:** nur möglich mit dem Setup-Token aus `setup.sh` (bzw. `SETUP_TOKEN`
  in `.env`). Wird automatisch Admin. Ohne `SETUP_TOKEN` gesetzt (z.B. lokale Entwicklung
  ohne `setup.sh`) ist der erste Account ungeschützt anlegbar.
- **Weitere Accounts:** standardmäßig gesperrt. Ein Admin kann unter `/settings` zwei
  Wege öffnen, auch kombiniert:
  - **Einladungslinks:** Admin erstellt unter „Einladungslinks" einen Link
    (`.../register?invite=<token>`) mit wählbarer Nutzungsanzahl und optionaler
    Gültigkeitsdauer, kopiert ihn und schickt ihn der Person. Funktioniert unabhängig
    vom „Registrierung erlauben"-Schalter.
  - **Offene Registrierung:** Schalter „Registrierung über das Login-Fenster erlauben"
    unter „Registrierung" — lässt sich jederzeit umschalten, ohne den Container neu zu
    starten.
- Nutzer sehen in den Einstellungen nur das, was für sie als Nutzer relevant ist
  (Scrobbler-Zugangsdaten, Import); den last.fm-API-Key der Instanz, den
  Registrierungs-Schalter und die Einladungslinks sieht und verwaltet nur ein Admin.

## Scrobbler-Client einrichten

In den Einstellungen (`/settings`) findest du nach dem Login:

- **API-Root** für last.fm-2.0-kompatible Clients: `https://<deine-domain>/2.0/`
  (Benutzername + dein last.fm-artiger Session Key, oder Login-Flow über
  `auth.getToken`/`auth.getSession`/`auth.getMobileSession`).
- **Handshake-URL** für alte Audioscrobbler-1.2-Clients: `https://<deine-domain>/legacy/`
  (Benutzername + dein normales Passwort).

Viele Scrobbler-Apps/Plugins (z.B. mobile Player, Browser-Extensions, foobar2000,
MPD-Setups) lassen sich auf eine "Custom"/"Libre.fm"-ähnliche Server-URL umstellen —
genau dafür ist das gedacht. Wer einen eigenen Client/eine eigene Integration dagegen
schreiben will, findet die komplette Protokoll-Referenz in [API.md](API.md).

## Von last.fm importieren

1. Als Admin einmalig unter `/settings` einen **last.fm API-Key** hinterlegen
   (kostenlos: <https://www.last.fm/api/account/create>, "Callback URL" kannst du leer
   lassen).
2. Jeder User trägt in `/settings` seinen **last.fm-Benutzernamen** ein und klickt
   "Import starten". In einem Durchlauf werden seitenweise sowohl der komplette
   öffentliche Scrobble-Verlauf (`user.getRecentTracks`) als auch die Loved-Tracks
   (`user.getLovedTracks`) geholt und eingetragen, mit getrennter Fortschrittsanzeige
   pro Phase. Läuft der Import nochmal, werden bereits importierte Scrobbles/Loves
   automatisch übersprungen.

Alternativ per CLI (z.B. für einen Erst-Import mehrerer Accounts):

```bash
cd server
npm run import:lastfm -- --user <lokaler-benutzername> --lastfm <lastfm-benutzername> --api-key <key>
```

## Entwicklung (ohne Docker)

```bash
npm install
docker compose up -d db          # nur die Datenbank
cp server/.env.example server/.env   # DATABASE_URL etc. anpassen
npm run -w server prisma:migrate:dev
npm run dev:server                # Server auf :4000
npm run dev:web                   # Vite-Dev-Server auf :5173, proxyt /api etc. zu :4000
```

## Architektur

```
server/   Fastify + Prisma (PostgreSQL), last.fm-kompatible API, Stats-Engine, Import-Worker
web/      React + Vite, Adolar-Branding, Recharts für die Visualisierungen
Dockerfile          Multi-Stage-Build: web + server -> ein Produktions-Image
docker-compose.yml  App + Postgres
```

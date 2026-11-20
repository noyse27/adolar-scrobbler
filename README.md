# Adolar Scrobbler 🚀

Dein eigener, selbst gehosteter last.fm-Klon für das Adolar-Universum. Nimmt Scrobbles
von jedem last.fm-kompatiblen Client an, zeigt fancy Statistiken (Charts, Hör-Kalender,
Hör-Uhr, Streaks, Musik-Diversität, "an diesem Tag vor Jahren" ...), hat eine Love-Funktion
und kann deinen kompletten Verlauf von last.fm importieren.

## Features

- **Multi-User**: jeder registriert sich einen eigenen Account, eigenes Profil unter `/u/<name>`.
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
cp .env.example .env
```

Trage in `.env` mindestens lange, zufällige Werte für `JWT_SECRET` und `COOKIE_SECRET`
ein (z.B. mit `openssl rand -hex 32`), setze `POSTGRES_PASSWORD` und — sobald du einen
Domainnamen hast — `PUBLIC_URL`.

```bash
docker compose up -d --build
```

Die App läuft danach auf `http://localhost:4000` (Port über `HOST_PORT` in `.env`
änderbar). Der erste registrierte Account wird automatisch Admin.

## Deployment auf deinem Webserver

1. Repo auf den Server kopieren, `.env` wie oben befüllen (echte Secrets!,
   `PUBLIC_URL=https://scrobbler.deine-domain.de`).
2. `docker compose up -d --build`.
3. Reverse Proxy (nginx/Caddy/Traefik) auf Container-Port `4000` (bzw. den in
   `HOST_PORT` gewählten Host-Port) zeigen lassen, TLS terminieren.
4. Fertig. Datenbank-Daten liegen im Docker-Volume `db-data` — für Backups
   `docker compose exec db pg_dump -U adolar adolar_scrobbler > backup.sql`.

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

## Scrobbler-Client einrichten

In den Einstellungen (`/settings`) findest du nach dem Login:

- **API-Root** für last.fm-2.0-kompatible Clients: `https://<deine-domain>/2.0/`
  (Benutzername + dein last.fm-artiger Session Key, oder Login-Flow über
  `auth.getToken`/`auth.getSession`/`auth.getMobileSession`).
- **Handshake-URL** für alte Audioscrobbler-1.2-Clients: `https://<deine-domain>/legacy/`
  (Benutzername + dein normales Passwort).

Viele Scrobbler-Apps/Plugins (z.B. mobile Player, Browser-Extensions, foobar2000,
MPD-Setups) lassen sich auf eine "Custom"/"Libre.fm"-ähnliche Server-URL umstellen —
genau dafür ist das gedacht.

## Von last.fm importieren

1. Als Admin einmalig unter `/settings` einen **last.fm API-Key** hinterlegen
   (kostenlos: <https://www.last.fm/api/account/create>, "Callback URL" kannst du leer
   lassen).
2. Jeder User trägt in `/settings` seinen **last.fm-Benutzernamen** ein und klickt
   "Import starten". Der komplette öffentliche Scrobble-Verlauf wird seitenweise über
   die offizielle last.fm-API (`user.getRecentTracks`) geholt und eingetragen, inkl.
   Fortschrittsanzeige. Läuft der Import nochmal, werden bereits importierte Scrobbles
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

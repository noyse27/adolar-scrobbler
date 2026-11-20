# API-Referenz

Adolar Scrobbler bietet zwei Scrobbling-Protokolle, mit denen bestehende Scrobbler-Clients
(Media-Player, Plugins, Browser-Extensions, mobile Apps) ohne Codeänderung gegen diese Instanz
laufen können, wenn sie eine eigene/"Custom" Server-URL erlauben:

- **Web Service 2.0** (`/2.0/`) — das aktuelle last.fm-API-Protokoll. Signierte Requests, XML-
  oder JSON-Antworten. Für neuere Clients.
- **Audioscrobbler 1.2 / "Legacy"** (`/legacy/`) — das alte Handshake-Protokoll. Reiner
  Klartext, keine Signatur. Für ältere Clients (foobar2000, mpdscribble, Rockbox, Amarok, ...).

Beide Protokolle sind offen dokumentiert und werden hier eigenständig reimplementiert, nicht aus
last.fm-Code übernommen. Es handelt sich um dieselbe Art Kompatibilitäts-Server, wie sie auch
Libre.fm, GNU FM oder Maloja anbieten.

Zugangsdaten für beide Protokolle findest du nach dem Login unter `/settings`:

- **Session Key** (für `/2.0/`) — last.fm-artiger Session-Schlüssel deines Accounts.
- **Normales Passwort** (für `/legacy/`) — die Legacy-Handshake-Authentifizierung nutzt dein
  Login-Passwort.

Admins sehen zusätzlich unter `/settings` den instanzweiten **API-Key** und **Shared Secret**
(nötig, falls du eine eigene Anwendung gegen die signierte 2.0-API schreibst, siehe unten).

---

## Web Service 2.0 (`/2.0/`)

Basis-URL: `https://<deine-domain>/2.0/`

Requests per `GET` oder `POST`, Parameter als Query-String oder Form-Body (beides wird
zusammengeführt). Jeder Request braucht `method` und `api_key`:

```
GET/POST /2.0/?method=<methodname>&api_key=<key>&...
```

### Response-Format

Standardmäßig XML (last.fm's `<lfm status="ok">...</lfm>`-Hülle). Mit `format=json` im Request
gibt es statt XML ein JSON-Objekt (last.fm-typisches `@attr`/`#text`-Shape für Attribute). Bei
Fehlern antwortet der Server mit HTTP 200 und:

```json
{ "error": <code>, "message": "<text>" }
```

bzw. als XML:

```xml
<lfm status="failed"><error code="<code>"><text></error></lfm>
```

Fehlercodes (Auszug, identisch zu last.fm):

| Code | Bedeutung |
|------|-----------|
| 4    | Auth failed (falsches Passwort/Session) |
| 6    | Invalid parameters (fehlende/ungültige Parameter) |
| 8    | Service failed (unbekannte Methode o.ä.) |
| 9    | Invalid session key |
| 13   | Invalid method signature (`api_sig` stimmt nicht) |

### Signierte Requests (`api_sig`)

Folgende Methoden müssen signiert sein: `auth.getSession`, `auth.getMobileSession`,
`track.scrobble`, `track.love`, `track.unlove`, `track.updateNowPlaying`.

Signatur-Berechnung, identisch zu last.fm:

1. Alle Request-Parameter außer `api_sig` und `format` nehmen.
2. Nach Parameter-Namen alphabetisch sortieren.
3. Für jeden Parameter `name` + `wert` ohne Trenner aneinanderhängen.
4. Das **Shared Secret** der Instanz anhängen.
5. MD5-Hash (hex) des Ergebnisses bilden → das ist `api_sig`.

```
api_sig = md5(param1 + value1 + param2 + value2 + ... + secret)
```

Das Shared Secret ist das `appSecret`, das ein Admin unter `/settings` sieht — nicht für Clients
gedacht, die sich im Namen eines Nutzers authentifizieren (genau wie bei last.fm auch), sondern
dafür, dass der Betreiber selbst eine eigene Anwendung dagegen schreiben kann. Wer nur einen
bestehenden Scrobbler-Client konfiguriert, braucht meist keine eigene Signaturberechnung — die
Clients bringen die last.fm-kompatible Signierlogik selbst mit, wenn man ihnen API-Key + Secret
der Instanz gibt (oder sie fragen beim Einrichten explizit danach).

### Authentifizierungs-Flow

**Mobile/Direkt-Flow** (Client hat ein eigenes Login-Formular mit Benutzername/Passwort) —
**der praktisch nutzbare Weg für fast alle Scrobbler-Clients:**

- `auth.getMobileSession` (signiert, mit `username` + `password`) → liefert direkt
  `session.key`.

**Browser-Flow** (last.fm-typisch für Clients ohne eigenes Login-Formular, z.B. Desktop-Apps,
die stattdessen einen Link öffnen):

1. `auth.getToken` → liefert ein `token` (30 Minuten gültig).
2. Der Client würde normalerweise den Nutzer im Browser auf eine Autorisierungs-Seite mit diesem
   Token schicken, auf der er eingeloggt bestätigt. Der Server implementiert dafür bereits das
   Backend-Endpoint (`POST /api/auth/authorize-token`), **aber es gibt in der Weboberfläche
   dieses Repos aktuell keine fertige Seite, die ein `token` aus der URL entgegennimmt und
   bestätigt** — das müsste man selbst ergänzen, falls ein Client darauf besteht. Praktisch
   also: nutze den Mobile-Flow, wenn der Client das anbietet.
3. `auth.getSession` (signiert, mit dem Token) → liefert `session.key`, sobald das Token
   autorisiert wurde.

Einfacher und ohne beides: den Session Key direkt aus `/settings` kopieren und fest im Client
eintragen, falls der Client das zulässt.

Der resultierende `sk` (Session Key) wird dann bei allen weiteren Requests mitgeschickt. Er ist
gültig, bis der Nutzer ihn in `/settings` widerruft.

### Methoden

| Methode | Signiert | Parameter | Beschreibung |
|---|---|---|---|
| `auth.getToken` | – | `api_key` | Liefert `token` für den Autorisierungs-Flow. |
| `auth.getSession` | ja | `api_key`, `token` | Tauscht ein autorisiertes `token` gegen `session.key`. |
| `auth.getMobileSession` | ja | `api_key`, `username`, `password` | Liefert `session.key` direkt per Login. |
| `track.updateNowPlaying` | ja | `sk`, `artist`, `track`, `album?`, `mbid?`, `duration?` | Setzt den "jetzt läuft"-Status. |
| `track.scrobble` | ja | `sk`, `artist`, `track`, `timestamp`, `album?`, `albumArtist?`, `mbid?`, `duration?` (auch `artist[0]`, `track[0]`, ... für Batches bis 50 Einträge) | Trägt einen oder mehrere Scrobbles ein. `timestamp` = Unix-Zeit (Sekunden) des Songstarts. Duplikate (gleicher Nutzer/Track/Zeitstempel) werden stillschweigend übersprungen. |
| `track.love` / `track.unlove` | ja | `sk`, `artist`, `track` | Setzt/entfernt den Love-Status eines Tracks. |
| `user.getInfo` | – | `api_key`, `user?`, `sk?` | Infos zu einem Nutzer (`user`-Parameter) oder — mit `sk` statt `user` — zum angemeldeten Nutzer. |
| `user.getRecentTracks` | – | `api_key`, `user`, `limit?` (max. 200, Default 50), `page?` | Scrobble-Verlauf eines Nutzers, neueste zuerst. |

Nicht implementierte last.fm-2.0-Methoden (z.B. `track.getInfo`, `chart.*`, Tagging, ...)
antworten mit Fehlercode 6 ("No method with that name in this package").

### Beispiel: ein Scrobble eintragen

```bash
curl "https://scrobbler.example.com/2.0/" \
  --data-urlencode "method=track.scrobble" \
  --data-urlencode "api_key=<key>" \
  --data-urlencode "sk=<session-key>" \
  --data-urlencode "artist=Boards of Canada" \
  --data-urlencode "track=Roygbiv" \
  --data-urlencode "timestamp=1732100000" \
  --data-urlencode "api_sig=<berechnete-signatur>" \
  --data-urlencode "format=json"
```

---

## Audioscrobbler 1.2 / Legacy (`/legacy/`)

Basis-URL: `https://<deine-domain>/legacy/`. Reines Klartext-Protokoll (kein XML/JSON), eine
Zeile Antwort pro Request. Gedacht für ältere Clients, die eine "Custom Server URL" im
Audioscrobbler-1.2-Stil abfragen.

### 1. Handshake

```
GET /legacy/?hs=true&p=1.2&c=<client-id>&v=<client-version>&u=<username>&t=<unix-timestamp>&a=<auth-token>
```

- `u` — Benutzername.
- `t` — aktueller Unix-Timestamp (Sekunden).
- `a` — `md5(md5(password) + t)`, also MD5 des eigenen Passworts, dann noch einmal mit dem
  Timestamp verkettet und MD5-gehasht.

Antwort bei Erfolg (3 Zeilen):

```
OK
<session-key>
https://<domain>/legacy/nowplaying
https://<domain>/legacy/submit
```

Bei Fehler: `BADAUTH` (falsche Zugangsdaten) oder `FAILED <grund>`.

### 2. Now Playing

```
POST /legacy/nowplaying
Content-Type: application/x-www-form-urlencoded

s=<session-key>&a=<artist>&t=<track>&b=<album>&l=<dauer-sekunden>&m=<mbid>
```

Antwort: `OK` oder `BADSESSION`.

### 3. Submit (Scrobbles)

```
POST /legacy/submit
Content-Type: application/x-www-form-urlencoded

s=<session-key>&a[0]=<artist>&t[0]=<track>&i[0]=<unix-timestamp>&b[0]=<album>&l[0]=<dauer-sekunden>&m[0]=<mbid>&...
```

Index `[0]`, `[1]`, ... für mehrere Scrobbles in einem Request. Pflichtfelder pro Eintrag sind
`a[n]`, `t[n]`, `i[n]`. Antwort: `OK` oder `BADSESSION`.

---

## Siehe auch

- README-Abschnitt ["Scrobbler-Client einrichten"](README.md#scrobbler-client-einrichten) für
  die Kurzfassung ohne eigene Client-Implementierung.
- [last.fm-Dokumentation des Web-Service-2.0-Protokolls](https://www.last.fm/api) und des
  [Audioscrobbler-1.2-Protokolls](https://www.last.fm/api/submissions) als Referenz, an die sich
  dieser Server hält (ohne last.fm-Code zu übernehmen).

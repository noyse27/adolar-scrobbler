# MusicBrainz- und Cover-Art-Integration

## Zielbild

MusicBrainz ergänzt vorhandene Scrobbles nachträglich um verlässliche Künstler-, Release- und
Recording-Daten. Das Cover Art Archive liefert Albumcover. Beide Dienste sind optionale
Anreicherungsquellen: Scrobbeln, Timeline und Statistiken funktionieren bei langsamen oder
nicht erreichbaren Fremddiensten unverändert schnell.

## Unverhandelbare Performance-Regeln

1. Kein Request an MusicBrainz oder das Cover Art Archive innerhalb eines Seiten- oder
   Scrobble-Requests.
2. Die Web-API liest ausschließlich aus PostgreSQL und dem lokalen Cover-Cache.
3. Ein Hintergrund-Worker arbeitet mit höchstens einem MusicBrainz-Request pro Sekunde,
   aussagekräftigem User-Agent, kurzen Timeouts und exponentiellem Backoff mit Jitter.
4. Treffer und Nicht-Treffer werden langfristig gecacht. Metadaten werden nicht regelmäßig
   gepollt, sondern nur manuell oder nach einer großzügigen Ablaufzeit neu geprüft.
5. Covers haben feste 250/500-Pixel-Varianten, Lazy Loading und einen sofort sichtbaren lokalen
   Platzhalter. Ein fehlendes Cover blockiert niemals Text oder Layout.

## Datenfluss

```text
Scrobble -> vorhandenen Track sofort speichern -> EnrichmentJob anlegen -> Antwort senden
                                                   |
                                              Hintergrund-Worker
                                                   |
                         MBID vorhanden? ----------+---------- Suche nach Artist/Release/Recording
                                                   |
                                      Treffer mit Konfidenz speichern
                                                   |
                                 Cover-Art-URL ermitteln und lokal cachen
```

Jobs werden pro Objekt dedupliziert. Der Worker beansprucht Jobs atomar, damit mehrere
App-Instanzen keine doppelten Abfragen erzeugen. Fehler verändern nur den Jobstatus, nie den
eigentlichen Musikdatensatz.

## Matching-Strategie

1. Vom Client oder Import gelieferte MBIDs sind die bevorzugte Quelle.
2. Ohne MBID wird normalisiert nach Künstler + Album + Track gesucht.
3. Exakte Künstler- und Tracknamen plus passende Tracklänge erhalten hohe Konfidenz.
4. Automatische Übernahme nur oberhalb eines konservativen Grenzwerts. Unsichere Treffer
   bleiben intern als Kandidaten gespeichert und werden nicht als Fakt angezeigt.
5. Bereits vorhandene Nutzerdaten werden nicht überschrieben. Angereicherte Felder haben
   Quelle, Konfidenz und Zeitpunkt.

## Vorgeschlagene Daten

- `Artist`: MusicBrainz-ID, sortierbarer Name, Typ, Land, Beginn/Ende, optionale Genres
- `Album`: Release-Group-ID, primärer/sekundärer Typ, erstes Veröffentlichungsdatum, Coverstatus
- `Track`: Recording-ID, Dauer und optional Disambiguation
- `EnrichmentJob`: Objektart, Objekt-ID, Status, Versuche, nächster Versuch, letzter Fehler
- `CoverAsset`: Release-Group-ID, 250/500-Pixel-Pfad, ETag/Quelle, Status und Prüfzeitpunkt

Genres sollten zunächst als kleine Liste direkt am Künstler bzw. Release gespeichert werden.
Credits, Labels und einzelne Editionen sind eine spätere Ausbaustufe, weil sie Datenmodell und
Oberfläche deutlich stärker vergrößern.

## Oberfläche

### Timeline

- 48-Pixel-Cover links, ansonsten ein farbiger lokaler Platzhalter mit Initialen
- Track und Künstler bleiben die dominante Information
- Album, Jahr und Release-Typ stehen in einer ruhigen zweiten Zeile
- Bilder werden mit festen Abmessungen und `loading="lazy"` geladen, damit nichts springt

### Album- und Künstlerdetails

Ein Klick aus Charts oder Timeline öffnet ein kompaktes Detail-Panel statt eines neuen
Navigationsbereichs:

- großes 250-Pixel-Cover beziehungsweise Künstler-Monogramm
- lokale Scrobblezahl, erster und letzter eigener Scrobble
- Veröffentlichungsjahr, Typ und bis zu drei Genres
- Link zu MusicBrainz als Quellenhinweis

### Statistiken

- Cover nur bei den ersten drei Top-Alben; die übrige Rangliste bleibt textbasiert
- optionale Genre-Verteilung erst dann anzeigen, wenn mindestens 70 Prozent der relevanten
  Scrobbles angereichert sind
- Abdeckungsgrad offen nennen, genau wie bei den Erscheinungsjahren

## Administrierbarkeit

Unter Einstellungen erhält der Admin nur eine kompakte Statusbox:

- angereicherte Künstler/Alben/Tracks
- wartende und fehlgeschlagene Jobs
- Cover-Cache-Größe
- Aktionen „Fehler erneut versuchen“ und „Ausgewählten Eintrag neu zuordnen“

Die Integration ist standardmäßig aktivierbar, aber vollständig abschaltbar. Ein manueller
„Bibliothek im Hintergrund anreichern“-Start erzeugt Jobs gestaffelt und verursacht keinen
Lastpeak.

## Umsetzung in Etappen

### Phase 1 – Fundament

- Migration für IDs, Enrichment-Status und Jobtabelle
- Worker mit Rate Limit, Timeout, Backoff, Deduplizierung und sauberem User-Agent
- direkte Übernahme bereits vorhandener MBIDs
- keine sichtbare UI außer Adminstatus

### Phase 2 – Matching und Covers

- konservative Suche für Datensätze ohne MBID
- Release-Group-Cover in 250/500 Pixel lokal cachen
- Platzhalter und Cover in Timeline sowie Top-Alben
- Negativcache für nicht gefundene Metadaten und Covers

### Phase 3 – Details

- kompaktes Künstler-/Album-Panel
- zusätzliche Release- und Künstlerdaten
- Abdeckungsanzeige und optionale Genre-Statistik
- manuelle Korrektur unsicherer Zuordnungen

## Abnahmekriterien

- Scrobble- und Profilantwortzeiten verändern sich bei abgeschaltetem Netzwerk nicht messbar.
- MusicBrainz- oder Cover-Art-Ausfälle erzeugen weder leere Seiten noch hängende Requests.
- Der Worker überschreitet das öffentliche MusicBrainz-Limit nicht.
- Ein Neustart setzt wartende Jobs sicher fort und erzeugt keine Duplikate.
- Cover verursachen keinen Layout-Shift und haben immer einen lokalen Fallback.
- Unsichere Zuordnungen werden nicht als verifizierte Metadaten dargestellt.

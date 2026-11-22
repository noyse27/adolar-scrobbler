import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import Heatmap from "../components/Heatmap";
import ListeningClock, { WeekdayChart } from "../components/ListeningClock";
import RangeTabs from "../components/RangeTabs";
import TopChart from "../components/TopChart";

function formatMs(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days}d ${hours % 24}h` : `${hours}h`;
}

export default function Statistics() {
  const { username } = useParams();
  const navigate = useNavigate();
  const [range, setRange] = useState("30d");
  const [overview, setOverview] = useState<any>(null);
  const [artists, setArtists] = useState<any[]>([]);
  const [albums, setAlbums] = useState<any[]>([]);
  const [tracks, setTracks] = useState<any[]>([]);
  const [releaseYears, setReleaseYears] = useState<{
    years: any[];
    decades: any[];
    coverage?: { known: number; total: number; ratio: number };
  }>({ years: [], decades: [] });
  const [genres, setGenres] = useState<{ genres: any[]; coverage?: { known: number; total: number; ratio: number } }>({ genres: [] });
  const [heatmap, setHeatmap] = useState<any[]>([]);
  const [clock, setClock] = useState<{ hourly: any[]; weekly: any[] } | null>(null);
  const [wild, setWild] = useState<any>(null);
  const year = new Date().getFullYear();

  useEffect(() => {
    if (!username) return;
    Promise.all([
      api.overview(username, range), api.topArtists(username, range),
      api.topAlbums(username, range), api.topTracks(username, range),
      api.releaseYears(username, range),
      api.genres(username, range),
    ]).then(([o, ar, al, tr, ry, ge]) => {
      setOverview(o); setArtists(ar); setAlbums(al); setTracks(tr); setReleaseYears(ry); setGenres(ge);
    });
  }, [username, range]);

  useEffect(() => {
    if (!username) return;
    api.heatmap(username, year).then(setHeatmap);
    api.clock(username).then(setClock as any);
    api.wild(username).then(setWild);
  }, [username, year]);

  if (!username) return null;
  const discovery = discoverySummary(wild?.discovery);
  const insights = buildInsights(overview, wild, clock);
  return (
    <div className="grid" style={{ gap: 24 }}>
      <div className="row profile-heading">
        <h2 style={{ margin: 0 }}>Statistiken von {username}</h2>
        <RangeTabs value={range} onChange={setRange} />
      </div>
      {overview && (
        <div className="grid grid-3">
          {[
            [overview.totalScrobbles, "Scrobbles"], [overview.uniqueArtists, "Künstler"],
            [overview.uniqueTracks, "Tracks"], [overview.uniqueAlbums, "Alben"],
            [formatMs(overview.estimatedListeningMs), "Geschätzte Hörzeit"],
            [wild?.streaks.currentStreak ?? 0, "Streak (Tage)"],
            [discovery.current, "Neue Künstler diesen Monat"],
          ].map(([value, label]) => <StatCard key={String(label)} value={value} label={String(label)} card />)}
        </div>
      )}
      {insights.length > 0 && (
        <div className="card insight-card">
          <h3>Dein Hörprofil auf einen Blick</h3>
          <div className="insight-list">
            {insights.map((insight) => <p key={insight}>{insight}</p>)}
          </div>
        </div>
      )}
      <div className="grid grid-2">
        <Chart title="Top Künstler" data={artists} onSelect={(row) => navigate(`/u/${username}/artist/${row.artistId}`)} />
        <Chart title="Top Tracks" data={tracks} />
        <Chart title="Top Alben" data={albums} onSelect={(row) => navigate(`/u/${username}/album/${row.albumId}`)} />
        <div className="card"><h3>Hör-Uhr (Stunde des Tages)</h3>{clock && <ListeningClock hourly={clock.hourly} />}</div>
        <div className="card"><h3>Hörtage</h3>{clock && <WeekdayChart weekly={clock.weekly} />}</div>
        <Chart title="Meistgehörte Jahrgänge" data={releaseYears.years.slice(0, 15)} note={coverageNote(releaseYears.coverage)} />
        <Chart title="Meistgehörte Jahrzehnte" data={releaseYears.decades} note={coverageNote(releaseYears.coverage)} />
        <Chart title="Genres" data={genres.genres} note={genreCoverageNote(genres.coverage)} />
      </div>
      <div className="card"><h3>Scrobble-Kalender {year}</h3><Heatmap days={heatmap} year={year} /></div>
      {wild && (
        <div className="card">
          <h3>Weitere Statistiken</h3>
          <div className="grid grid-3">
            <StatCard value={`${Math.round(wild.diversity.entropy * 100)}%`} label="Musik-Diversität" />
            <StatCard value={`${Math.round(wild.share.top10 * 100)}%`} label="Top-10-Künstler-Anteil" />
            <StatCard value={`${Math.round(wild.nightOwl * 100)}%`} label="Nachteulen-Score" />
            <StatCard value={wild.streaks.longestStreak} label="Längster Streak (Tage)" />
          </div>
          {wild.onThisDay?.length > 0 && (
            <div style={{ marginTop: 20 }}><h3>An diesem Tag vor Jahren</h3>
              {wild.onThisDay.slice(0, 5).map((item: any, index: number) => (
                <div className="track-row" key={`${item.playedAt}-${index}`}>
                  <div className="track-meta"><div className="track-name">{item.track}</div><div className="artist-name">{item.artist}</div></div>
                  <span className="muted">{item.year}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Chart({ title, data, note, onSelect }: { title: string; data: any[]; note?: string; onSelect?: (row: any) => void }) {
  return <div className="card"><h3>{title}</h3><TopChart data={data} onSelect={onSelect} />{note && <p className="chart-note">{note}</p>}</div>;
}

function StatCard({ value, label, card = false }: { value: React.ReactNode; label: string; card?: boolean }) {
  return <div className={`${card ? "card " : ""}stat-tile`}><div className="value">{value}</div><div className="label">{label}</div></div>;
}

function discoverySummary(rows?: { month: string; newArtists: number }[]) {
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return { current: rows?.find((row) => row.month === key)?.newArtists ?? 0 };
}

function buildInsights(overview: any, wild: any, clock: { hourly: any[]; weekly: any[] } | null): string[] {
  const insights: string[] = [];
  if (overview?.totalScrobbles > 0 && wild?.share) {
    insights.push(`Deine zehn meistgehörten Künstler machen ${Math.round(wild.share.top10 * 100)} % deiner Scrobbles aus.`);
  }
  const busiestHour = clock?.hourly.reduce((best, hour) => hour.count > best.count ? hour : best, { hour: 0, count: 0 });
  if (busiestHour?.count > 0) {
    insights.push(`Am häufigsten hörst du zwischen ${busiestHour.hour}:00 und ${(busiestHour.hour + 1) % 24}:00 Uhr.`);
  }
  const discovery = discoverySummary(wild?.discovery);
  if (discovery.current > 0) {
    insights.push(`Diesen Monat hast du ${discovery.current} neue Künstler entdeckt.`);
  }
  return insights.slice(0, 3);
}

function coverageNote(coverage?: { known: number; total: number; ratio: number }): string | undefined {
  if (!coverage || coverage.total === 0) return undefined;
  return `Erscheinungsjahr für ${Math.round(coverage.ratio * 100)} % der Scrobbles bekannt (${coverage.known.toLocaleString("de-DE")} von ${coverage.total.toLocaleString("de-DE")}).`;
}

function genreCoverageNote(coverage?: { known: number; total: number; ratio: number }): string | undefined {
  if (!coverage || coverage.total === 0) return undefined;
  return `Genre-Daten für ${Math.round(coverage.ratio * 100)} % der Scrobbles vorhanden. Ein Track kann mehreren Genres zugeordnet sein.`;
}

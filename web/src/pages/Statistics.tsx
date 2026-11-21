import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import Heatmap from "../components/Heatmap";
import ListeningClock from "../components/ListeningClock";
import RangeTabs from "../components/RangeTabs";
import TopChart from "../components/TopChart";

function formatMs(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days}d ${hours % 24}h` : `${hours}h`;
}

export default function Statistics() {
  const { username } = useParams();
  const [range, setRange] = useState("30d");
  const [overview, setOverview] = useState<any>(null);
  const [artists, setArtists] = useState<any[]>([]);
  const [albums, setAlbums] = useState<any[]>([]);
  const [tracks, setTracks] = useState<any[]>([]);
  const [releaseYears, setReleaseYears] = useState<{ years: any[]; decades: any[] }>({ years: [], decades: [] });
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
    ]).then(([o, ar, al, tr, ry]) => {
      setOverview(o); setArtists(ar); setAlbums(al); setTracks(tr); setReleaseYears(ry);
    });
  }, [username, range]);

  useEffect(() => {
    if (!username) return;
    api.heatmap(username, year).then(setHeatmap);
    api.clock(username).then(setClock as any);
    api.wild(username).then(setWild);
  }, [username, year]);

  if (!username) return null;
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
          ].map(([value, label]) => <StatCard key={String(label)} value={value} label={String(label)} card />)}
        </div>
      )}
      <div className="grid grid-2">
        <Chart title="Top Künstler" data={artists} />
        <Chart title="Top Tracks" data={tracks} />
        <Chart title="Top Alben" data={albums} />
        <div className="card"><h3>Hör-Uhr (Stunde des Tages)</h3>{clock && <ListeningClock hourly={clock.hourly} />}</div>
        <Chart title="Meistgehörte Jahrgänge" data={releaseYears.years.slice(0, 15)} />
        <Chart title="Meistgehörte Jahrzehnte" data={releaseYears.decades} />
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

function Chart({ title, data }: { title: string; data: any[] }) {
  return <div className="card"><h3>{title}</h3><TopChart data={data} /></div>;
}

function StatCard({ value, label, card = false }: { value: React.ReactNode; label: string; card?: boolean }) {
  return <div className={`${card ? "card " : ""}stat-tile`}><div className="value">{value}</div><div className="label">{label}</div></div>;
}

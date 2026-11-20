import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import RangeTabs from "../components/RangeTabs";
import TopChart from "../components/TopChart";
import Heatmap from "../components/Heatmap";
import ListeningClock from "../components/ListeningClock";
import TrackRow from "../components/TrackRow";

function formatMs(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  return `${hours}h`;
}

export default function Profile() {
  const { username } = useParams();
  const { me } = useAuth();
  const isOwn = me?.username === username;

  const [range, setRange] = useState("30d");
  const [overview, setOverview] = useState<any>(null);
  const [artists, setArtists] = useState<any[]>([]);
  const [albums, setAlbums] = useState<any[]>([]);
  const [tracks, setTracks] = useState<any[]>([]);
  const [recent, setRecent] = useState<any>(null);
  const [heatmap, setHeatmap] = useState<any[]>([]);
  const [clock, setClock] = useState<{ hourly: any[]; weekly: any[] } | null>(null);
  const [wild, setWild] = useState<any>(null);
  const year = new Date().getFullYear();

  useEffect(() => {
    if (!username) return;
    api.overview(username, range).then(setOverview);
    api.topArtists(username, range).then(setArtists);
    api.topAlbums(username, range).then(setAlbums);
    api.topTracks(username, range).then(setTracks);
  }, [username, range]);

  useEffect(() => {
    if (!username) return;
    api.recent(username, 20).then(setRecent);
    api.heatmap(username, year).then(setHeatmap);
    api.clock(username).then(setClock as any);
    api.wild(username).then(setWild);
  }, [username]);

  if (!username) return null;

  return (
    <div className="grid" style={{ gap: 24 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>{username}</h2>
          {recent?.nowPlaying && (
            <p className="pill">
              ▶ läuft gerade: {recent.nowPlaying.artist} – {recent.nowPlaying.track}
            </p>
          )}
        </div>
        <RangeTabs value={range} onChange={setRange} />
      </div>

      {overview && (
        <div className="grid grid-3">
          <div className="card stat-tile">
            <div className="value">{overview.totalScrobbles}</div>
            <div className="label">Scrobbles</div>
          </div>
          <div className="card stat-tile">
            <div className="value">{overview.uniqueArtists}</div>
            <div className="label">Künstler</div>
          </div>
          <div className="card stat-tile">
            <div className="value">{overview.uniqueTracks}</div>
            <div className="label">Tracks</div>
          </div>
          <div className="card stat-tile">
            <div className="value">{overview.uniqueAlbums}</div>
            <div className="label">Alben</div>
          </div>
          <div className="card stat-tile">
            <div className="value">{formatMs(overview.estimatedListeningMs)}</div>
            <div className="label">Geschätzte Hörzeit</div>
          </div>
          {wild && (
            <div className="card stat-tile">
              <div className="value">{wild.streaks.currentStreak}</div>
              <div className="label">Streak (Tage)</div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h3>Top Künstler</h3>
          <TopChart data={artists} />
        </div>
        <div className="card">
          <h3>Top Tracks</h3>
          <TopChart data={tracks} />
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3>Top Alben</h3>
          <TopChart data={albums} />
        </div>
        <div className="card">
          <h3>Hör-Uhr (Stunde des Tages)</h3>
          {clock && <ListeningClock hourly={clock.hourly} />}
        </div>
      </div>

      <div className="card">
        <h3>Scrobble-Kalender {year}</h3>
        <Heatmap days={heatmap} year={year} />
      </div>

      {wild && (
        <div className="card">
          <h3>Wilde Statistiken</h3>
          <div className="grid grid-3">
            <div className="stat-tile">
              <div className="value">{Math.round(wild.diversity.entropy * 100)}%</div>
              <div className="label">Musik-Diversität</div>
            </div>
            <div className="stat-tile">
              <div className="value">{Math.round(wild.share.top10 * 100)}%</div>
              <div className="label">Top-10-Künstler-Anteil</div>
            </div>
            <div className="stat-tile">
              <div className="value">{Math.round(wild.nightOwl * 100)}%</div>
              <div className="label">Nachteulen-Score</div>
            </div>
            <div className="stat-tile">
              <div className="value">{wild.streaks.longestStreak}</div>
              <div className="label">Längster Streak (Tage)</div>
            </div>
          </div>
          {wild.onThisDay?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3>An diesem Tag vor Jahren</h3>
              {wild.onThisDay.slice(0, 5).map((o: any, i: number) => (
                <div className="track-row" key={i}>
                  <div className="track-meta">
                    <div className="track-name">{o.track}</div>
                    <div className="artist-name">{o.artist}</div>
                  </div>
                  <span className="muted">{o.year}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3>Zuletzt gehört</h3>
        {recent?.scrobbles?.map((s: any) => (
          <TrackRow key={s.id} data={s} editable={isOwn} />
        ))}
      </div>
    </div>
  );
}

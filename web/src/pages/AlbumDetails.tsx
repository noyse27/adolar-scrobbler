import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";

function date(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("de-DE") : "–";
}

function duration(ms?: number | null) {
  if (!ms) return "";
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function AlbumDetails() {
  const { username, albumId } = useParams();
  const [album, setAlbum] = useState<any>(null);
  useEffect(() => {
    if (username && albumId) api.album(albumId, username).then(setAlbum);
  }, [username, albumId]);
  if (!album || !username) return null;
  return (
    <div className="grid" style={{ gap: 20 }}>
      <div className="detail-hero card">
        {album.coverUrl ? <img className="detail-cover" src={album.coverUrl} alt="" /> : <div className="detail-monogram">{album.name.slice(0, 1)}</div>}
        <div>
          <p className="detail-kicker">{[album.primaryType, ...album.secondaryTypes].filter(Boolean).join(" · ") || "Album"}</p>
          <h2>{album.name}</h2>
          <p><Link to={`/u/${username}/artist/${album.artistId}`}>{album.artist}</Link></p>
          {album.firstReleaseDate && <p className="muted">Erstveröffentlichung: {album.firstReleaseDate}</p>}
          {album.musicBrainzUrl && <a href={album.musicBrainzUrl} target="_blank" rel="noreferrer">Bei MusicBrainz ansehen ↗</a>}
        </div>
      </div>
      <div className="grid grid-3">
        <DetailStat value={album.stats.playcount} label="Scrobbles" />
        <DetailStat value={date(album.stats.firstPlayedAt)} label="Erstmals gehört" />
        <DetailStat value={date(album.stats.lastPlayedAt)} label="Zuletzt gehört" />
      </div>
      <div className="card"><h3>Tracks</h3>
        {album.tracks.map((track: any) => (
          <div className="track-row" key={track.id}>
            <div className="track-meta"><div className="track-name">{track.name}</div><div className="artist-name">{track.credits.join(" · ")}</div></div>
            <span className="muted">{track.playcount}×{duration(track.durationMs) ? ` · ${duration(track.durationMs)}` : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailStat({ value, label }: { value: React.ReactNode; label: string }) {
  return <div className="card stat-tile"><div className="value">{value}</div><div className="label">{label}</div></div>;
}

import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import TopChart from "../components/TopChart";

function date(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("de-DE") : "–";
}

export default function ArtistDetails() {
  const { username, artistId } = useParams();
  const [artist, setArtist] = useState<any>(null);

  useEffect(() => {
    if (username && artistId) api.artist(artistId, username).then(setArtist);
  }, [username, artistId]);

  if (!artist || !username) return null;
  return (
    <div className="grid" style={{ gap: 20 }}>
      <div className="detail-hero card">
        <div className="detail-monogram">{artist.name.slice(0, 1).toUpperCase()}</div>
        <div>
          <p className="detail-kicker">{artist.type || "Künstler"}{artist.country ? ` · ${artist.country}` : ""}</p>
          <h2>{artist.name}</h2>
          {artist.disambiguation && <p className="muted">{artist.disambiguation}</p>}
          <div className="tag-list">{artist.genres.map((genre: string) => <span className="pill" key={genre}>{genre}</span>)}</div>
          {artist.musicBrainzUrl && <a href={artist.musicBrainzUrl} target="_blank" rel="noreferrer">Bei MusicBrainz ansehen ↗</a>}
        </div>
      </div>
      <div className="grid grid-3">
        <DetailStat value={artist.stats.playcount} label="Scrobbles" />
        <DetailStat value={date(artist.stats.firstPlayedAt)} label="Erstmals gehört" />
        <DetailStat value={date(artist.stats.lastPlayedAt)} label="Zuletzt gehört" />
      </div>
      <div className="grid grid-2">
        <div className="card"><h3>Top Tracks</h3><TopChart data={artist.topTracks} /></div>
        <div className="card">
          <h3>Alben</h3>
          <div className="album-grid">
            {artist.albums.map((album: any) => (
              <Link className="album-tile" to={`/u/${username}/album/${album.id}`} key={album.id}>
                {album.coverUrl ? <img src={album.coverUrl} alt="" loading="lazy" /> : <div className="album-placeholder">{album.name.slice(0, 1)}</div>}
                <span>{album.name}</span><small>{album.year || album.type || ""}</small>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailStat({ value, label }: { value: React.ReactNode; label: string }) {
  return <div className="card stat-tile"><div className="value">{value}</div><div className="label">{label}</div></div>;
}

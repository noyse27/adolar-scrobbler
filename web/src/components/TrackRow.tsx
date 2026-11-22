import React, { useState } from "react";
import { api } from "../api";
import { Link } from "react-router-dom";

export interface TrackRowData {
  trackId: string;
  track: string;
  artist: string;
  artistId?: string;
  album?: string | null;
  albumId?: string | null;
  year?: number | null;
  coverUrl?: string | null;
  playedAt?: string;
  loved: boolean;
}

export default function TrackRow({
  data,
  editable,
  profileUsername,
  onLoveChange,
}: {
  data: TrackRowData;
  editable: boolean;
  profileUsername: string;
  onLoveChange?: (loved: boolean) => void;
}) {
  const [loved, setLoved] = useState(data.loved);
  const [busy, setBusy] = useState(false);

  async function toggleLove() {
    if (busy) return;
    setBusy(true);
    try {
      if (loved) {
        await api.unlove(data.trackId);
      } else {
        await api.love(data.artist, data.track);
      }
      setLoved(!loved);
      onLoveChange?.(!loved);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="track-row">
      <div className="track-cover" aria-hidden="true">
        {data.coverUrl ? (
          <img src={data.coverUrl} alt="" loading="lazy" width="48" height="48" />
        ) : (
          <span>{(data.album || data.track).trim().slice(0, 1).toUpperCase()}</span>
        )}
      </div>
      <div className="track-meta">
        <div className="track-name">{data.track}</div>
        <div className="artist-name">
          {data.artistId ? <Link to={`/u/${profileUsername}/artist/${data.artistId}`}>{data.artist}</Link> : data.artist}
          {data.album ? " · " : ""}
          {data.album && data.albumId ? <Link to={`/u/${profileUsername}/album/${data.albumId}`}>{data.album}</Link> : data.album}
          {data.year ? ` · ${data.year}` : ""}
        </div>
      </div>
      <div className="row">
        {data.playedAt && (
          <span className="muted">{new Date(data.playedAt).toLocaleString("de-DE")}</span>
        )}
        {editable && (
          <button className={`love-btn ${loved ? "loved" : ""}`} onClick={toggleLove} disabled={busy}>
            {loved ? "♥" : "♡"}
          </button>
        )}
      </div>
    </div>
  );
}

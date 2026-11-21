import React, { useState } from "react";
import { api } from "../api";

export interface TrackRowData {
  trackId: string;
  track: string;
  artist: string;
  album?: string | null;
  year?: number | null;
  playedAt?: string;
  loved: boolean;
}

export default function TrackRow({
  data,
  editable,
  onLoveChange,
}: {
  data: TrackRowData;
  editable: boolean;
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
      <div className="track-meta">
        <div className="track-name">{data.track}</div>
        <div className="artist-name">
          {data.artist}
          {data.album ? ` · ${data.album}` : ""}
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

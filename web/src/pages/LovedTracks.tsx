import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import TrackRow from "../components/TrackRow";

export default function LovedTracks() {
  const { username } = useParams();
  const { me } = useAuth();
  const isOwn = me?.username === username;
  const [loves, setLoves] = useState<any[] | null>(null);

  useEffect(() => {
    if (!username) return;
    api.loves(username).then(setLoves);
  }, [username]);

  if (!username) return null;

  return (
    <div className="grid" style={{ gap: 24 }}>
      <h2 style={{ margin: 0 }}>Lieblingstracks von {username}</h2>
      <div className="card">
        {loves?.length === 0 && <p className="muted">Noch keine Lieblingstracks.</p>}
        {loves?.map((l) => (
          <TrackRow
            key={l.trackId}
            data={{
              trackId: l.trackId,
              track: l.track,
              artist: l.artist,
              artistId: l.artistId,
              album: l.album,
              albumId: l.albumId,
              year: l.year,
              coverUrl: l.coverUrl,
              playedAt: l.lovedAt,
              loved: true,
            }}
            editable={isOwn}
            profileUsername={username}
            onLoveChange={(loved) => {
              if (!loved) setLoves((prev) => prev?.filter((x) => x.trackId !== l.trackId) ?? prev);
            }}
          />
        ))}
      </div>
    </div>
  );
}

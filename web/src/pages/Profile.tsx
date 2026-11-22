import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import TrackRow from "../components/TrackRow";

export default function Profile() {
  const { username } = useParams();
  const { me } = useAuth();
  const isOwn = me?.username === username;
  const [recent, setRecent] = useState<any>(null);

  useEffect(() => {
    if (!username) return;
    const refresh = () => api.recent(username, 20).then(setRecent);
    refresh();
    const timer = setInterval(refresh, 15_000);
    return () => clearInterval(timer);
  }, [username]);

  if (!username) return null;
  return (
    <div className="grid" style={{ gap: 24 }}>
      <div className="row profile-heading">
        <div>
          <h2 style={{ margin: 0 }}>{username}</h2>
          {recent?.nowPlaying && (
            <p className="pill">
              ▶ läuft gerade: {recent.nowPlaying.artist} – {recent.nowPlaying.track}
              {recent.nowPlaying.year ? ` (${recent.nowPlaying.year})` : ""}
            </p>
          )}
        </div>
        <Link className="btn btn-ghost" to={`/u/${username}/stats`}>Statistiken ansehen</Link>
      </div>
      <div className="card">
        <h3>Zuletzt gehört</h3>
        {recent?.scrobbles?.map((s: any) => <TrackRow key={s.id} data={s} editable={isOwn} profileUsername={username} />)}
      </div>
    </div>
  );
}

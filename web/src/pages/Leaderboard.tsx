import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function Leaderboard() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    api.leaderboard().then(setRows);
  }, []);

  return (
    <div className="card">
      <h3>Instanz-Leaderboard</h3>
      <p className="muted">Wer scrobbelt am meisten auf dieser Adolar-Scrobbler-Instanz?</p>
      {rows.map((r, i) => (
        <div className="track-row" key={r.username}>
          <div className="track-meta">
            <span className="pill" style={{ marginRight: 10 }}>
              #{i + 1}
            </span>
            <Link to={`/u/${r.username}`} className="track-name">
              {r.displayName ?? r.username}
            </Link>
          </div>
          <span className="muted">{r.playcount} Scrobbles</span>
        </div>
      ))}
    </div>
  );
}

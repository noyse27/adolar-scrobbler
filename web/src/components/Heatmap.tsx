import React, { useMemo } from "react";

interface Day {
  date: string;
  count: number;
}

function colorFor(count: number, max: number): string {
  if (count === 0) return "var(--bg-elevated)";
  const ratio = Math.min(count / Math.max(max, 1), 1);
  if (ratio < 0.25) return "#2b2470";
  if (ratio < 0.5) return "#4f2ec8";
  if (ratio < 0.75) return "#6e44ff";
  return "#31d5ff";
}

export default function Heatmap({ days, year }: { days: Day[]; year: number }) {
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d.count])), [days]);
  const max = useMemo(() => Math.max(1, ...days.map((d) => d.count)), [days]);

  const start = new Date(`${year}-01-01T00:00:00Z`);
  const end = new Date(`${year}-12-31T00:00:00Z`);
  const startOffset = start.getUTCDay();
  const cells: { date: string | null; count: number }[] = [];
  for (let i = 0; i < startOffset; i++) cells.push({ date: null, count: 0 });
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    cells.push({ date: iso, count: byDate.get(iso) ?? 0 });
  }

  return (
    <div className="heatmap-grid">
      {cells.map((c, i) => (
        <div
          key={i}
          className="heatmap-cell"
          title={c.date ? `${c.date}: ${c.count} Scrobbles` : ""}
          style={{ background: c.date ? colorFor(c.count, max) : "transparent" }}
        />
      ))}
    </div>
  );
}

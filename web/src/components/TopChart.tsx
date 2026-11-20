import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface Row {
  name: string;
  artist?: string;
  playcount: number;
}

const COLORS = ["#31d5ff", "#6e44ff", "#a98bff", "#ff9500", "#ffd35a"];

export default function TopChart({ data }: { data: Row[] }) {
  if (data.length === 0) return <p className="muted">Noch keine Daten.</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 30)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={160}
          tick={{ fill: "#b3a9e0", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(169,139,255,.08)" }}
          contentStyle={{ background: "#1d1850", border: "1px solid rgba(169,139,255,.3)", borderRadius: 8 }}
          labelStyle={{ color: "#f1edff" }}
          itemStyle={{ color: "#f1edff" }}
          formatter={(value: number) => [`${value} Scrobbles`, ""]}
        />
        <Bar dataKey="playcount" radius={[0, 6, 6, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

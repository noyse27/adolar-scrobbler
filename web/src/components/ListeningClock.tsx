import React from "react";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from "recharts";

export default function ListeningClock({ hourly }: { hourly: { hour: number; count: number }[] }) {
  const data = hourly.map((h) => ({ hour: `${h.hour}h`, count: h.count }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart data={data}>
        <PolarGrid stroke="rgba(169,139,255,.2)" />
        <PolarAngleAxis dataKey="hour" tick={{ fill: "#b3a9e0", fontSize: 10 }} />
        <Tooltip
          contentStyle={{ background: "#1d1850", border: "1px solid rgba(169,139,255,.3)", borderRadius: 8 }}
        />
        <Radar dataKey="count" stroke="#31d5ff" fill="#31d5ff" fillOpacity={0.35} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

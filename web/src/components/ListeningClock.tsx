import React from "react";
import { BarChart, Bar, XAxis, YAxis, RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from "recharts";

export default function ListeningClock({ hourly }: { hourly: { hour: number; count: number }[] }) {
  const data = hourly.map((h) => ({ hour: `${h.hour}h`, count: h.count }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart data={data}>
        <PolarGrid stroke="rgba(169,139,255,.2)" />
        <PolarAngleAxis dataKey="hour" tick={{ fill: "#b3a9e0", fontSize: 10 }} />
        <Tooltip
          contentStyle={{ background: "#1d1850", border: "1px solid rgba(169,139,255,.3)", borderRadius: 8 }}
          labelStyle={{ color: "#f1edff" }}
          itemStyle={{ color: "#f1edff" }}
        />
        <Radar dataKey="count" stroke="#31d5ff" fill="#31d5ff" fillOpacity={0.35} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export function WeekdayChart({ weekly }: { weekly: { weekday: number; count: number }[] }) {
  const data = weekly.map((day) => ({ name: WEEKDAYS[day.weekday], count: day.count }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
        <XAxis dataKey="name" tick={{ fill: "#b3a9e0", fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#b3a9e0", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: "#1d1850", border: "1px solid rgba(169,139,255,.3)", borderRadius: 8 }}
          labelStyle={{ color: "#f1edff" }}
          itemStyle={{ color: "#f1edff" }}
          formatter={(value: number) => [`${value} Scrobbles`, ""]}
        />
        <Bar dataKey="count" fill="#6e44ff" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

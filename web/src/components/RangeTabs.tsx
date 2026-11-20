import React from "react";

const RANGES: { key: string; label: string }[] = [
  { key: "7d", label: "7 Tage" },
  { key: "30d", label: "30 Tage" },
  { key: "90d", label: "90 Tage" },
  { key: "365d", label: "1 Jahr" },
  { key: "all", label: "Alle Zeit" },
];

export default function RangeTabs({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="range-tabs">
      {RANGES.map((r) => (
        <button key={r.key} className={r.key === value ? "active" : ""} onClick={() => onChange(r.key)}>
          {r.label}
        </button>
      ))}
    </div>
  );
}

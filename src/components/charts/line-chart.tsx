"use client";
import * as React from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, SERIES_COLORS } from "./palette";

export interface ChartSeries {
  key: string;
  name: string;
  points: Array<{ date: string; value: number }>;
}

/** Time-series line chart: 2px lines, recessive grid, crosshair tooltip, legend for ≥2 series. */
export function TimeSeriesChart({ series, height = 260, valueLabel, yDomain }: { series: ChartSeries[]; height?: number; valueLabel?: string; yDomain?: [number, number] }) {
  const data = React.useMemo(() => {
    const map = new Map<string, Record<string, number | string>>();
    for (const s of series) {
      for (const p of s.points) {
        const day = p.date.slice(0, 10);
        const row = map.get(day) ?? { date: day };
        row[s.key] = p.value;
        map.set(day, row);
      }
    }
    return [...map.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [series]);
  if (data.length === 0) return <p className="py-10 text-center text-xs text-muted">No data in this range.</p>;
  const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: data.length > 60 ? "2-digit" : undefined, timeZone: "UTC" });
  return (
    <div style={{ height }} role="img" aria-label={`Line chart of ${series.map((s) => s.name).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={AXIS.grid} vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtDate} stroke={AXIS.stroke} tick={{ fill: AXIS.tick, fontSize: 11 }} tickLine={false} minTickGap={28} />
          <YAxis stroke={AXIS.stroke} tick={{ fill: AXIS.tick, fontSize: 11 }} tickLine={false} axisLine={false} domain={yDomain ?? ["auto", "auto"]} width={48} />
          <Tooltip
            cursor={{ stroke: AXIS.tick, strokeDasharray: "3 3" }}
            contentStyle={{ background: "#151a28", border: "1px solid #2f3850", borderRadius: 8, fontSize: 12, color: "#e6e9f2" }}
            labelStyle={{ color: "#8b93a8" }}
            labelFormatter={(l) => fmtDate(String(l))}
            formatter={(v, name) => [`${Number(v).toLocaleString()}${valueLabel ? ` ${valueLabel}` : ""}`, name]}
          />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: "#8b93a8" }} iconType="plainline" />}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={2}
              dot={data.length <= 20 ? { r: 3, strokeWidth: 0, fill: SERIES_COLORS[i % SERIES_COLORS.length] } : false}
              activeDot={{ r: 4, stroke: "#10141f", strokeWidth: 2 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, SERIES_COLORS } from "./palette";

/** Single-measure horizontal bar chart: one hue (identity = the measure), rounded data-ends, hover tooltip. */
export function HBarChart({ data, valueLabel, height }: { data: Array<{ label: string; value: number }>; valueLabel: string; height?: number }) {
  if (data.length === 0) return <p className="py-6 text-center text-xs text-muted">No data.</p>;
  const h = height ?? Math.max(120, data.length * 30 + 30);
  return (
    <div style={{ height: h }} role="img" aria-label={`Bar chart of ${valueLabel}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }} barCategoryGap={6}>
          <CartesianGrid stroke={AXIS.grid} horizontal={false} />
          <XAxis type="number" stroke={AXIS.stroke} tick={{ fill: AXIS.tick, fontSize: 11 }} tickLine={false} />
          <YAxis type="category" dataKey="label" width={150} stroke={AXIS.stroke} tick={{ fill: AXIS.tick, fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{ background: "#151a28", border: "1px solid #2f3850", borderRadius: 8, fontSize: 12, color: "#e6e9f2" }}
            formatter={(v) => [Number(v).toLocaleString(), valueLabel]}
          />
          <Bar dataKey="value" fill={SERIES_COLORS[0]} radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

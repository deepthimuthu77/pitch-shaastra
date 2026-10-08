"use client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Scorecard, Sections, Simulation } from "@/lib/types";
import { money } from "./ui";

const grid = "var(--border)";
const tick = { fill: "var(--muted)", fontSize: 11 };
export function ScoreChart({
  scores,
  before,
}: {
  scores: Scorecard;
  before?: Scorecard;
}) {
  const data = Object.entries(scores).map(([key, score]) => ({
    name:
      key === "model" ? "Business model" : key[0].toUpperCase() + key.slice(1),
    score,
    before: before?.[key as keyof Scorecard],
  }));
  return (
    <div
      className="chart"
      role="img"
      aria-label={`Pitch scorecard: ${Object.entries(scores)
        .map(([key, value]) => key + " " + value)
        .join(", ")}`}
    >
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={data} outerRadius="74%">
          <PolarGrid stroke={grid} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <PolarAngleAxis dataKey="name" tick={tick} />
          <Radar
            name="This attempt"
            dataKey="score"
            stroke="#74e9b6"
            fill="#74e9b6"
            fillOpacity={0.18}
          />
          {before && (
            <Radar
              name="Previous attempt"
              dataKey="before"
              stroke="#9b93ba"
              fill="#9b93ba"
              fillOpacity={0.08}
            />
          )}
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              borderColor: grid,
              color: "var(--text)",
            }}
          />
          <Legend />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function RevenueChart({
  scenarios,
  simulation,
  currency,
  locale,
}: {
  scenarios: NonNullable<Sections["revenue"]>["scenarios"];
  simulation: Simulation;
  currency: string;
  locale: string;
}) {
  const data = simulation.bands.map((band, i) => ({
    month: band.month,
    p10: band.p10,
    band: band.p90 - band.p10,
    p50: band.p50,
    base: scenarios.base.rows[i]?.revenue,
    pessimistic: scenarios.pessimistic.rows[i]?.revenue,
    optimistic: scenarios.optimistic.rows[i]?.revenue,
  }));
  return (
    <div
      className="chart"
      role="img"
      aria-label="Monthly revenue under pessimistic, base and optimistic scenarios with simulated p10 to p90 uncertainty band"
    >
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={data} margin={{ left: 8, right: 15, top: 10 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis
            dataKey="month"
            tick={tick}
            tickLine={false}
            axisLine={false}
            minTickGap={30}
          />
          <YAxis
            tick={tick}
            tickFormatter={(v) => money(v, currency, locale)}
            tickLine={false}
            axisLine={false}
            width={70}
          />
          <Tooltip
            formatter={(v, name) => [money(Number(v), currency, locale), name]}
            contentStyle={{
              background: "var(--surface)",
              borderColor: grid,
              color: "var(--text)",
            }}
          />
          <Area
            type="monotone"
            dataKey="p10"
            stackId="band"
            stroke="none"
            fill="transparent"
            legendType="none"
          />
          <Area
            type="monotone"
            dataKey="band"
            name="p10–p90 span"
            stackId="band"
            stroke="none"
            fill="#74e9b6"
            fillOpacity={0.12}
          />
          <Area
            type="monotone"
            dataKey="base"
            name="Base"
            fill="none"
            stroke="#74e9b6"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="pessimistic"
            name="Pessimistic"
            fill="none"
            stroke="#ff6b83"
            strokeDasharray="4 4"
          />
          <Area
            type="monotone"
            dataKey="optimistic"
            name="Optimistic"
            fill="none"
            stroke="#58cff5"
            strokeDasharray="4 4"
          />
          <Legend />
        </AreaChart>
      </ResponsiveContainer>
      <small className="chart-caption">
        Month · Monthly revenue · Bands describe the sampled model assumptions,
        not calibrated probabilities.
      </small>
    </div>
  );
}
export function Tornado({
  items,
  currency,
  locale,
}: {
  items: NonNullable<Sections["sensitivity"]>["items"];
  currency: string;
  locale: string;
}) {
  const data = items.map((item) => ({
    ...item,
    label: item.assumption.replaceAll("_", " "),
  }));
  return (
    <div
      className="chart"
      role="img"
      aria-label="Sensitivity ranked by change in end-horizon annualized revenue"
    >
      <ResponsiveContainer width="100%" height={330}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 15, right: 20 }}
        >
          <CartesianGrid stroke={grid} horizontal={false} />
          <XAxis
            type="number"
            tick={tick}
            tickFormatter={(v) => money(v, currency, locale)}
          />
          <YAxis dataKey="label" type="category" tick={tick} width={140} />
          <Bar
            dataKey="swing"
            name="ARR swing"
            fill="#9b93ee"
            radius={[0, 4, 4, 0]}
          />
          <Tooltip
            formatter={(v) => money(Number(v), currency, locale)}
            contentStyle={{
              background: "var(--surface)",
              borderColor: grid,
              color: "var(--text)",
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function TrendChart({
  rows,
}: {
  rows: {
    title: string;
    score: number;
    scorecard: Scorecard;
    attempt: number;
  }[];
}) {
  return (
    <div
      className="chart"
      role="img"
      aria-label="Your pitch score trend across completed attempts"
    >
      <ResponsiveContainer width="100%" height={240}>
        <LineChart
          data={rows.map((row, i) => ({
            ...row,
            session: i + 1,
            ...row.scorecard,
          }))}
        >
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="session" tick={tick} />
          <YAxis domain={[0, 100]} tick={tick} />
          <Line
            dataKey="score"
            name="Overall"
            stroke="#74e9b6"
            strokeWidth={3}
            dot={{ r: 4 }}
          />
          <Line
            dataKey="clarity"
            name="Clarity"
            stroke="#58cff5"
            dot={false}
            strokeDasharray="3 3"
          />
          <Line
            dataKey="traction"
            name="Traction"
            stroke="#ffd166"
            dot={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              borderColor: grid,
              color: "var(--text)",
            }}
          />
          <Legend />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

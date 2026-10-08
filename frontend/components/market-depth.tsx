import type { Sections } from "@/lib/types";
import { Badge, Metric, money } from "./ui";

export function MarketDepth({ sections }: { sections: Sections }) {
  const insights = sections.market_insights;
  if (!insights) return null;
  return (
    <section className="card">
      <h2>Growth and market structure</h2>
      <div className="metrics-grid">
        <Metric
          label="PUBLISHED CAGR"
          value={
            insights.growth.cagr == null
              ? "Unavailable"
              : `${(insights.growth.cagr * 100).toFixed(1)}%`
          }
          note={
            insights.growth.period_start
              ? `${insights.growth.period_start}–${insights.growth.period_end}`
              : "No supported period"
          }
        />
        <Metric label="GROWTH EVIDENCE" value={insights.growth.status} />
        <Metric label="MARKET STRUCTURE" value={insights.structure.status} />
      </div>
      <p>{insights.growth.method}</p>
      {insights.structure.observations.map((item, i) => (
        <p key={i}>
          {item.text}{" "}
          <small>Sources: {item.source_ids.join(", ") || "none"}</small>
        </p>
      ))}
      {insights.structure.unknowns.map((item) => (
        <p key={item}>Unknown: {item}</p>
      ))}
    </section>
  );
}
export function FeatureMatrix({
  value,
}: {
  value?: NonNullable<Sections["competitors"]>["feature_matrix"];
}) {
  if (!value) return null;
  return (
    <section className="card">
      <h2>Competitor feature matrix</h2>
      <p>
        Unknown means unsupported by the retrieved evidence; it does not mean
        the competitor lacks this capability.
      </p>
      <div className="table-scroll">
        <table className="heatmap-table">
          <thead>
            <tr>
              <th>Competitor</th>
              {value.features.map((f) => (
                <th key={f}>{f}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {value.rows.map((row) => (
              <tr key={row.competitor}>
                <td>{row.competitor}</td>
                {value.features.map((feature) => {
                  const cell = row.cells.find((c) => c.feature === feature);
                  return (
                    <td key={feature}>
                      {cell?.status === "supported" ? (
                        <>
                          <Badge tone="green">Supported</Badge>
                          <p>{cell.value}</p>
                          <small>{cell.source_ids.join(", ")}</small>
                        </>
                      ) : (
                        <Badge tone="amber">Unknown</Badge>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function WedgeStability({
  value,
}: {
  value: NonNullable<Sections["wedges"]>["stability"];
}) {
  if (typeof value === "string") return <p>{value}</p>;
  return (
    <div>
      <Badge tone={value.stable ? "green" : "amber"}>
        {value.stable ? "Stable across evaluations" : "Ranking varies"}
      </Badge>
      <p>
        {value.method} · Top agreement: {Math.round(value.top_agreement * 100)}%
      </p>
      {value.evaluations.map((run) => (
        <p key={run.name}>
          {run.name}: {run.ranking.join(" → ")}
        </p>
      ))}
      <small>
        {Array.isArray(value.limitations)
          ? value.limitations.join(" ")
          : value.limitations}
      </small>
    </div>
  );
}
export function Beachhead({
  value,
  currency,
  locale,
}: {
  value?: NonNullable<Sections["wedges"]>["items"][number]["beachhead"];
  currency: string;
  locale: string;
}) {
  if (!value) return null;
  return (
    <div className="practice-cue">
      <h4>Beachhead planning range</h4>
      <p>
        {value.accounts.low.toLocaleString()}–
        {value.accounts.high.toLocaleString()} accounts · base{" "}
        {value.accounts.base.toLocaleString()}
      </p>
      <p>
        Annual revenue: {money(value.annual_revenue.low, currency, locale)}–
        {money(value.annual_revenue.high, currency, locale)}
      </p>
      <small>
        {value.rationale} · {value.provenance.replaceAll("_", " ")}
      </small>
    </div>
  );
}

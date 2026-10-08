import { Badge, Metric } from "./ui";

export type CohortComparison = {
  id?: string;
  name?: string;
  available: boolean;
  reason?: string;
  average_score?: number;
  dimensions?: Record<string, number>;
  participants?: number;
  real_sessions?: number;
  score_distribution?: { p25: number; p50: number; p75: number };
  your_comparison?: {
    score_delta: number;
    dimension_deltas: Record<string, number>;
  };
  method?: string;
};
export function CohortComparisonView({ value }: { value: CohortComparison }) {
  if (!value.available)
    return (
      <section className="card">
        <h3>{value.name || "Cohort comparison"}</h3>
        <Badge tone="amber">Suppressed</Badge>
        <p>
          {value.reason ||
            "At least 5 consenting real participants and 10 real sessions are required."}
        </p>
        <small>{value.method}</small>
      </section>
    );
  const delta = value.your_comparison?.score_delta;
  return (
    <section className="card">
      <h3>{value.name || "Your cohort comparison"}</h3>
      <div className="metrics-grid">
        <Metric label="PARTICIPANTS" value={value.participants ?? "—"} />
        <Metric label="COHORT AVERAGE" value={value.average_score ?? "—"} />
        <Metric
          label="P25 / P50 / P75"
          value={
            value.score_distribution
              ? `${value.score_distribution.p25} / ${value.score_distribution.p50} / ${value.score_distribution.p75}`
              : "—"
          }
        />
        <Metric
          label="YOUR SCORE VS AVERAGE"
          value={
            delta == null ? "Not sharing" : `${delta >= 0 ? "+" : ""}${delta}`
          }
          note="Latest real completed session"
        />
      </div>
      {value.dimensions && (
        <div className="table-scroll">
          <table className="heatmap-table">
            <thead>
              <tr>
                <th>Dimension</th>
                <th>Cohort average</th>
                <th>Your difference</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(value.dimensions).map(([key, score]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{score}</td>
                  <td>{value.your_comparison?.dimension_deltas[key] ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p>{value.method}</p>
      <small>
        Practice scores only. No pitch text or identity is disclosed. This
        distribution is not funding readiness.
      </small>
    </section>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Download,
  FlaskConical,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { api, download, post } from "@/lib/api";
import type { Pitch, Scorecard } from "@/lib/types";
import { Badge, Empty, ErrorBox, Loading, Metric } from "@/components/ui";
import { TrendChart } from "@/components/charts";
type Analytics = {
  sessions: {
    id: string;
    title: string;
    score: number;
    scorecard: Scorecard;
    attempt: number;
    difficulty: string;
    is_synthetic: boolean;
    created_at: number;
  }[];
  session_count: number;
  completed_count: number;
  average_score: number | null;
  latest_score: number | null;
  heatmap: {
    category: string;
    n: number;
    directness: number;
    specificity: number;
    evidence_strength: number;
  }[];
  benchmark: { available: boolean; reason: string; real_session_count: number };
  interpretation: string;
};

export default function Dashboard() {
  const [data, setData] = useState<Analytics>();
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const [overview, rows] = await Promise.all([
        api<Analytics>("/api/analytics/overview"),
        api<Pitch[]>("/api/pitches"),
      ]);
      setData(overview);
      setPitches(rows);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function seed() {
    setBusy(true);
    try {
      await post("/api/demo/seed", {});
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR FOUNDER WORKSPACE</span>
          <h1>
            Progress you can point to<span className="mint-dot">.</span>
          </h1>
          <p>Practice. Find the weak spot. Bring back better evidence.</p>
        </div>
        <div className="button-row">
          <button className="button ghost" disabled={busy} onClick={seed}>
            <FlaskConical size={15} />
            {busy ? "Building examples…" : "Load demo examples"}
          </button>
          <Link href="/pitch" className="button primary">
            <Plus size={16} />
            New pitch
          </Link>
        </div>
      </div>
      {error && <ErrorBox error={error} retry={load} />}
      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="metrics-grid">
            <Metric
              label="PITCH SESSIONS"
              value={data.session_count}
              note={`${data.completed_count} completed reports`}
            />
            <Metric
              label="AVERAGE PRACTICE SCORE"
              value={data.average_score ?? "—"}
              note="Your sessions only"
            />
            <Metric
              label="LATEST SCORE"
              value={data.latest_score ?? "—"}
              note="Try again to compare scorecards"
            />
            <Metric
              label="REAL BENCHMARK SESSIONS"
              value={data.benchmark.real_session_count}
              note="Synthetic data excluded"
            />
          </div>
          {data.sessions.length ? (
            <section className="card dashboard-chart">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">BETTER PREPARATION, OVER TIME</span>
                  <h2>Your practice trajectory</h2>
                </div>
                <Badge>Includes labelled demo sessions</Badge>
              </div>
              <TrendChart rows={data.sessions} />
              <p>{data.interpretation}</p>
            </section>
          ) : (
            <Empty
              title="Your next pitch can be your first."
              text="Complete a pitch for a scorecard and progress trend. Or load three clearly labelled synthetic examples."
            >
              <Link href="/pitch" className="button primary">
                Start a pitch <ArrowRight size={16} />
              </Link>
            </Empty>
          )}
          <div className="section-heading">
            <div>
              <span className="eyebrow">YOUR RECENT SESSIONS</span>
              <h2>Pick up where you left off.</h2>
            </div>
            <button
              className="text-button"
              onClick={() =>
                download("/api/user/export", "pitchgrill-workspace.json").catch(
                  (e) => setError(e.message),
                )
              }
            >
              <Download size={14} />
              Export all data
            </button>
          </div>
          <div className="history-grid">
            {pitches.map((p) => (
              <section className="history-card" key={p.id}>
                <div className="inline-meta">
                  <Badge tone={p.status === "finished" ? "green" : "amber"}>
                    {p.status}
                  </Badge>
                  {p.is_synthetic && <Badge>Demo</Badge>}
                  <span>Attempt {p.attempt_number}</span>
                </div>
                <h3>{p.title}</h3>
                <p>
                  {new Date(p.created_at * 1000).toLocaleDateString()} ·{" "}
                  {p.difficulty}
                </p>
                <div className="history-card-score">
                  {p.report?.overall_score ?? "In progress"}
                  {p.report && <small>/100</small>}
                </div>
                {p.comparison && (
                  <Badge tone="green">Compared with previous attempt</Badge>
                )}
                <div className="button-row">
                  <Link
                    className="button secondary"
                    href={p.report ? `/pitch/${p.id}/report` : `/pitch/${p.id}`}
                  >
                    {p.report ? "View report" : "Continue"}
                    <ArrowRight size={13} />
                  </Link>
                  {p.report && (
                    <Link
                      className="button ghost"
                      href={`/pitch?retry=${p.id}`}
                    >
                      <RotateCcw size={12} />
                      Retry
                    </Link>
                  )}
                  <button
                    className="icon-button"
                    aria-label={`Delete ${p.title}`}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Delete this pitch session? Its separate analysis remains available.",
                        )
                      )
                        api(`/api/pitches/${p.id}`, { method: "DELETE" })
                          .then(load)
                          .catch((e) => setError(e.message));
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </section>
            ))}
          </div>
          {data.heatmap.length > 0 && (
            <section className="card" style={{ marginTop: 28 }}>
              <span className="eyebrow">WHERE YOUR ANSWERS HOLD UP</span>
              <h2>Question-category heatmap</h2>
              <div className="table-scroll">
                <table className="heatmap-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Answers</th>
                      <th>Directness</th>
                      <th>Specificity</th>
                      <th>Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.heatmap.map((row) => (
                      <tr key={row.category}>
                        <td>{row.category.replaceAll("_", " ")}</td>
                        <td>{row.n}</td>
                        {[
                          row.directness,
                          row.specificity,
                          row.evidence_strength,
                        ].map((value, i) => (
                          <td key={i}>
                            <span
                              style={{
                                background:
                                  value >= 70
                                    ? "#1e4735"
                                    : value >= 40
                                      ? "#4b4026"
                                      : "#4b2834",
                                color:
                                  value >= 70
                                    ? "#a4efc7"
                                    : value >= 40
                                      ? "#f0d58c"
                                      : "#ffb1c4",
                              }}
                            >
                              {value}/100
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Model or demo-rule judgments, not calibrated objective measures.
                Averages include your labelled demo sessions.
              </p>
            </section>
          )}
          <section className="card" style={{ marginTop: 25 }}>
            <h2>Benchmarks that don&apos;t pretend.</h2>
            <p>{data.benchmark.reason}</p>
            <Badge tone="amber">No percentile fabricated</Badge>
            <p style={{ marginTop: 16 }}>
              Your own before-and-after comparisons are available now. Group
              benchmarks require a sufficiently sized, consented real cohort.
            </p>
            <Link href="/cohorts" className="button ghost">
              Cohort workspace <ArrowRight size={15} />
            </Link>
          </section>
        </>
      )}
    </>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/api";
import type { Pitch, Trajectory } from "@/lib/types";
import { Badge, ErrorBox } from "./ui";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { revealMessage } from "@/lib/reveal-message";

export function InterestTrajectory({
  rows,
  pitchId,
}: {
  rows?: Trajectory[];
  pitchId?: string;
}) {
  if (!rows?.length) return null;
  const data = rows.map((row) => ({
    answer: row.answer_index,
    ...row.interest,
  }));
  return (
    <section className="card">
      <span className="eyebrow">EVERY ANSWER CHANGES THE ROOM</span>
      <h2>Investor-interest trajectory</h2>
      <div
        className="chart"
        role="img"
        aria-label="Investor interest after each submitted answer"
      >
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data}>
            <CartesianGrid stroke="var(--border)" />
            <XAxis dataKey="answer" />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Legend />
            {Object.entries({
              vc: "#74e9b6",
              operator: "#f7c869",
              customer: "#ee98b0",
              impact: "#93a8ef",
            }).map(([key, color]) => (
              <Line
                key={key}
                name={key}
                dataKey={key}
                stroke={color}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="button-row">
        {rows
          .filter((r) => r.message_id)
          .map((r) => (
            <a
              key={r.answer_index}
              onClick={() => revealMessage(r.message_id)}
              href={`${pitchId ? `/pitch/${pitchId}/report` : ""}#message-${r.message_id}`}
              className="text-button"
            >
              Answer {r.answer_index}
            </a>
          ))}
      </div>
      <small>
        Interest is a practice judgment, not investment intent or funding
        probability.
      </small>
    </section>
  );
}

export function ImprovementLoop({ pitch }: { pitch: Pitch }) {
  const router = useRouter(),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  async function practice(category: string) {
    setBusy(category);
    setError("");
    try {
      const p = await post<Pitch>("/api/pitch/practice", {
        pitch_id: pitch.id,
        category,
      });
      router.push(`/pitch/${p.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const report = pitch.report;
  if (!report) return null;
  return (
    <>
      {report.readiness && (
        <section className="card readiness-card">
          <span className="eyebrow">READINESS, WITH ITS LIMITS</span>
          <h2>
            {report.readiness.band} · {report.readiness.score}/100
          </h2>
          <p>Evidence coverage: {report.readiness.coverage_percent}%</p>
          <p>{report.readiness.method}</p>
          <small>
            {Array.isArray(report.readiness.limitations)
              ? report.readiness.limitations.join(" ")
              : report.readiness.limitations}
          </small>
          {report.rubric && (
            <details>
              <summary>
                Scoring anchors and methodology · {report.rubric.version}
              </summary>
              <pre className="rubric-detail">
                {JSON.stringify(report.rubric.anchors, null, 2)}
              </pre>
              <pre className="rubric-detail">
                {JSON.stringify(report.rubric.dimensions, null, 2)}
              </pre>
            </details>
          )}
        </section>
      )}
      {!!report.improvement_plan?.length && (
        <section className="card">
          <span className="eyebrow">
            WEAKNESS → EVIDENCE → PRACTICE → RETRY
          </span>
          <h2>Your improvement plan</h2>
          <div className="weakness-grid">
            {report.improvement_plan.map((item) => (
              <article key={item.category} className="improvement-item">
                <Badge>{item.category.replaceAll("_", " ")}</Badge>
                <h3>{item.title}</h3>
                <blockquote>{item.evidence}</blockquote>
                {item.message_id && (
                  <a href={`#message-${item.message_id}`}>
                    Review the original answer
                  </a>
                )}
                <p>
                  <strong>Why it matters:</strong> {item.why_it_matters}
                </p>
                <p>{item.action}</p>
                <p>
                  <strong>Success criterion:</strong> {item.success_criterion}
                </p>
                <button
                  className="button secondary"
                  disabled={Boolean(busy)}
                  onClick={() => void practice(item.category)}
                >
                  {busy === item.category
                    ? "Starting…"
                    : `Practice ${item.category.replaceAll("_", " ")}`}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
      {!!report.targeted_practice?.length && (
        <section className="card">
          <h2>Focused practice questions</h2>
          {report.targeted_practice.map((item) => (
            <details className="prep-question" key={item.category}>
              <summary>{item.question}</summary>
              <p>{item.success_criterion}</p>
              <button
                className="button secondary"
                disabled={Boolean(busy)}
                onClick={() => void practice(item.category)}
              >
                Practice this question
              </button>
            </details>
          ))}
        </section>
      )}
      {error && <ErrorBox error={error} />}
      <InterestTrajectory
        rows={report.interest_trajectory || pitch.interest_history}
      />
    </>
  );
}

function changedWords(before: string, after: string) {
  const a = before.trim().split(/\s+/).slice(0, 600),
    b = after.trim().split(/\s+/).slice(0, 600);
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const retainedA = new Set<number>(),
    retainedB = new Set<number>();
  let i = 0,
    j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      retainedA.add(i++);
      retainedB.add(j++);
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return { a, b, retainedA, retainedB };
}
export function RewriteDiff({
  before,
  after,
  changes,
}: {
  before: string;
  after: string;
  changes?: NonNullable<Pitch["report"]>["rewrite_changes"];
}) {
  const words = changedWords(before, after);
  return (
    <>
      <div className="rewrite-grid">
        <div>
          <Badge>Original · removed or reframed</Badge>
          <p>
            {words.a.map((word, i) => (
              <span
                className={words.retainedA.has(i) ? "" : "diff-removed"}
                key={i}
              >
                {word}{" "}
              </span>
            ))}
          </p>
        </div>
        <div>
          <Badge tone="green">Rewritten · added wording</Badge>
          <p>
            {words.b.map((word, i) => (
              <span
                className={words.retainedB.has(i) ? "" : "diff-added"}
                key={i}
              >
                {word}{" "}
              </span>
            ))}
          </p>
        </div>
      </div>
      {changes?.map((change, i) => (
        <details className="prep-question" key={i}>
          <summary>
            {change.category.replaceAll("_", " ")} · Why this change helps
          </summary>
          <p>
            <del>{change.before}</del>
          </p>
          <p>
            <ins>{change.after}</ins>
          </p>
          <p>{change.reason}</p>
        </details>
      ))}
    </>
  );
}

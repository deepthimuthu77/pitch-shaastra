"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Download, Printer, RotateCcw } from "lucide-react";
import { api, getConfig, download } from "@/lib/api";
import type { Config, Pitch } from "@/lib/types";
import {
  Avatar,
  Badge,
  ErrorBox,
  Loading,
  Metric,
  Thinking,
} from "@/components/ui";
import { ScoreChart } from "@/components/charts";

export default function PitchReport({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [pitch, setPitch] = useState<Pitch>();
  const [config, setConfig] = useState<Config>();
  const [error, setError] = useState("");
  const load = () => {
    api<Pitch>(`/api/pitches/${id}`)
      .then(setPitch)
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    load();
    getConfig()
      .then(setConfig)
      .catch(() => {});
  }, [id]);
  if (!pitch || !config)
    return error ? (
      <ErrorBox error={error} retry={load} />
    ) : (
      <Loading text="Loading your coaching report" />
    );
  if (!pitch.report)
    return (
      <div className="empty-state">
        <h1>This pitch is still in progress.</h1>
        <Link href={`/pitch/${id}`} className="button primary">
          Return to the room
        </Link>
      </div>
    );
  const report = pitch.report;
  return (
    <div className="print-report">
      <div className="page-heading">
        <div>
          <span className="eyebrow">THE QUESTION IS WHAT YOU DO NEXT</span>
          <h1>
            Your next pitch starts here<span className="mint-dot">.</span>
          </h1>
          <p>
            {pitch.title} · Attempt {pitch.attempt_number} ·{" "}
            {new Date(pitch.created_at * 1000).toLocaleDateString()}
          </p>
        </div>
        <div className="button-row no-print">
          <button className="button ghost" onClick={() => window.print()}>
            <Printer size={15} />
            Print / PDF
          </button>
          <Link className="button primary" href={`/pitch?retry=${id}`}>
            <RotateCcw size={16} />
            Pitch again
          </Link>
        </div>
      </div>
      {pitch.is_synthetic && (
        <div className="demo-note">
          <Badge tone="amber">DEMO COACHING</Badge> This report uses local
          heuristics, not a reasoning model. It is excluded from real-user
          benchmarks.
        </div>
      )}
      {pitch.report_note && <ErrorBox error={pitch.report_note} />}
      <div className="report-top">
        <section className="card scorecard">
          <div className="card-heading">
            <h2>Your scorecard</h2>
            <Badge>Practice judgment</Badge>
          </div>
          <div className="scorecard-inner">
            <Metric
              label="OVERALL"
              value={
                <>
                  {report.overall_score}
                  <small>/100</small>
                </>
              }
              note="A coaching signal, not funding probability"
            />
            <ScoreChart
              scores={report.scorecard}
              before={pitch.comparison?.before}
            />
          </div>
          <div className="score-dimensions">
            {Object.entries(report.scorecard).map(([key, value]) => (
              <div key={key}>
                <span>{key === "model" ? "Business model" : key}</span>
                <strong>
                  {value}
                  {pitch.comparison && (
                    <small
                      className={
                        pitch.comparison.deltas[
                          key as keyof typeof report.scorecard
                        ] >= 0
                          ? "positive"
                          : "negative"
                      }
                    >
                      {pitch.comparison.deltas[
                        key as keyof typeof report.scorecard
                      ] >= 0
                        ? "+"
                        : ""}
                      {
                        pitch.comparison.deltas[
                          key as keyof typeof report.scorecard
                        ]
                      }
                    </small>
                  )}
                </strong>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <span className="eyebrow">THE PANEL&apos;S VERDICT</span>
          <h2>What would it take?</h2>
          <div className="verdict-list">
            {report.verdicts.map((v) => {
              const member = config.panel.find((p) => p.id === v.id)!;
              return (
                <div key={v.id} className="verdict">
                  <Avatar member={member} size={50} />
                  <div>
                    <strong>{member.name}</strong>
                    <Badge
                      tone={
                        v.decision === "in"
                          ? "green"
                          : v.decision === "out"
                            ? "coral"
                            : "amber"
                      }
                    >
                      {v.decision === "in"
                        ? "I'm in"
                        : v.decision === "out"
                          ? "I'm out"
                          : "I'd need more evidence"}
                    </Badge>
                    <p>{v.reason}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR THREE HIGHEST-PRIORITY GAPS</span>
          <h2>Turn the friction into a plan.</h2>
        </div>
      </div>
      <div className="weakness-grid">
        {report.weaknesses.map((w, i) => (
          <section className="card weakness" key={i}>
            <span className="weakness-number">0{i + 1}</span>
            <h3>{w.title}</h3>
            <blockquote>“{w.evidence}”</blockquote>
            <span className="eyebrow">YOUR NEXT MOVE</span>
            <p>{w.action}</p>
          </section>
        ))}
      </div>
      <section className="card pitch-rewrite">
        <div className="card-heading">
          <div>
            <span className="eyebrow">A CLEARER 60-SECOND VERSION</span>
            <h2>Same idea. A sharper story.</h2>
          </div>
          <button
            className="button ghost no-print"
            onClick={() =>
              navigator.clipboard
                .writeText(report.rewritten_pitch)
                .catch(() =>
                  setError("Clipboard unavailable. Select and copy the text."),
                )
            }
          >
            Copy pitch
          </button>
        </div>
        <div className="rewrite-grid">
          <div>
            <Badge>Original</Badge>
            <p>{pitch.idea}</p>
          </div>
          <div>
            <Badge tone="green">Rewritten · validate placeholders</Badge>
            <p>{report.rewritten_pitch}</p>
          </div>
        </div>
        <small>
          Square-bracket placeholders identify missing evidence. No traction or
          market figures are invented.
        </small>
      </section>
      <div className="report-bottom">
        <section className="card">
          <span className="eyebrow">BE READY FOR THE FOLLOW-UP</span>
          <h2>Your toughest-question prep sheet.</h2>
          {report.prep_sheet.map((item, i) => (
            <details className="prep-question" key={i}>
              <summary>
                <span>0{i + 1}</span>
                {item.question}
              </summary>
              <p>{item.suggested_answer}</p>
            </details>
          ))}
        </section>
        <section className="card">
          <span className="eyebrow">ACCOUNTABILITY, WITHOUT THE GOTCHA</span>
          <h2>Questions left unanswered</h2>
          {report.dodged.length ? (
            report.dodged.map((item, i) => (
              <div className="dodged-item" key={i}>
                <h3>{item.question}</h3>
                <blockquote>{item.answer}</blockquote>
                <p>
                  Practice a direct answer, or state honestly what you
                  haven&apos;t measured.
                </p>
              </div>
            ))
          ) : (
            <p>
              No high-confidence explicit dodges were flagged. This does not
              prove every question was fully answered.
            </p>
          )}
          <Link
            href={`/analysis/${pitch.analysis_id}`}
            className="button secondary"
          >
            Challenge the idea&apos;s assumptions <ArrowRight size={16} />
          </Link>
          <button
            className="button ghost no-print"
            onClick={() =>
              download(`/api/user/export`, "pitchgrill-workspace.json").catch(
                (e) => setError(e.message),
              )
            }
          >
            <Download size={15} />
            Export workspace
          </button>
        </section>
      </div>
      <Thinking busy={false} meta={pitch.llm_meta} />
      {error && <ErrorBox error={error} />}
      <div className="next-step-banner">
        <div>
          <span className="eyebrow">THE POINT IS PROGRESS</span>
          <h2>Take one weakness. Make it stronger.</h2>
          <p>
            Return with evidence, retry the pitch, and compare your scorecards.
          </p>
        </div>
        <Link className="button primary" href={`/pitch?retry=${id}`}>
          Take another shot <ArrowRight size={17} />
        </Link>
      </div>
    </div>
  );
}

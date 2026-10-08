"use client";
import { useEffect, useState } from "react";
import { api, post } from "@/lib/api";
import { Badge, ErrorBox, Metric } from "@/components/ui";
import {
  CohortComparisonView,
  type CohortComparison,
} from "@/components/cohort-comparison";
type Cohort = {
  id: string;
  name: string;
  role: string;
  member_count: number;
  my_consent: boolean;
  benchmark_available: boolean;
  privacy_rule: string;
  real_sessions?: number;
  average_score?: number;
  dimensions?: Record<string, number>;
  comparison?: CohortComparison;
};
export default function Cohorts() {
  const [rows, setRows] = useState<
    { id: string; name: string; role: string }[]
  >([]);
  const [cohort, setCohort] = useState<Cohort>();
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [alias, setAlias] = useState("");
  const [consent, setConsent] = useState(false);
  const [invite, setInvite] = useState("");
  const [error, setError] = useState("");
  const load = () =>
    api<typeof rows>("/api/org")
      .then(setRows)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  const show = (id: string) =>
    api<Cohort>(`/api/org/${id}`)
      .then(setCohort)
      .catch((e) => setError(e.message));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ACCELERATORS & EDUCATORS</span>
          <h1>Practice together. Keep ideas private.</h1>
          <p>
            Cohort analytics without turning confidential pitches into shared
            content.
          </p>
        </div>
      </div>
      {error && <ErrorBox error={error} />}
      <div className="compare-layout">
        <section className="card">
          <h2>Create a cohort</h2>
          <form
            className="pivot-form"
            onSubmit={(e) => {
              e.preventDefault();
              post<{ id: string }>("/api/org", { name })
                .then(async (result) => {
                  await load();
                  await show(result.id);
                })
                .catch((e) => setError(e.message));
            }}
          >
            <label>
              Name
              <input
                required
                minLength={3}
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button className="button primary">Create private cohort</button>
          </form>
          <p>
            As host, you can create a seven-day invitation token. You decide
            where to send it.
          </p>
        </section>
        <section className="card">
          <h2>Join a cohort</h2>
          <form
            className="pivot-form"
            onSubmit={(e) => {
              e.preventDefault();
              post<{ id: string }>("/api/org/join", {
                token,
                alias,
                share_metrics: consent,
              })
                .then(async (result) => {
                  await load();
                  await show(result.id);
                })
                .catch((e) => setError(e.message));
            }}
          >
            <label>
              Invitation token
              <input
                required
                minLength={20}
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </label>
            <label>
              Your alias
              <input
                required
                maxLength={60}
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              Share only my real-session aggregate scores with this cohort. No
              ideas or transcripts. I can withdraw later.
            </label>
            <button className="button secondary">Join cohort</button>
          </form>
        </section>
      </div>
      <div className="button-row" style={{ marginBottom: 24 }}>
        {rows.map((row) => (
          <button
            className="button ghost"
            key={row.id}
            onClick={() => show(row.id)}
          >
            {row.name} · {row.role}
          </button>
        ))}
      </div>
      {cohort && (
        <section className="card">
          <div className="card-heading">
            <h2>{cohort.name}</h2>
            <Badge>{cohort.role}</Badge>
          </div>
          <p>{cohort.privacy_rule}</p>
          <div className="metrics-grid">
            <Metric label="MEMBERS" value={cohort.member_count} />
            <Metric
              label="REAL SESSIONS"
              value={cohort.real_sessions ?? "Suppressed"}
            />
            <Metric
              label="AVERAGE SCORE"
              value={cohort.average_score ?? "Suppressed"}
            />
            <Metric
              label="BENCHMARK"
              value={
                cohort.benchmark_available ? "Available" : "Insufficient cohort"
              }
            />
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={cohort.my_consent}
              onChange={(e) =>
                post(`/api/org/${cohort.id}/consent`, {
                  share_metrics: e.target.checked,
                })
                  .then(() => show(cohort.id))
                  .catch((e) => setError(e.message))
              }
            />
            Share my real-session aggregate scores with this cohort.
          </label>
          {cohort.role === "owner" && (
            <button
              style={{ marginTop: 20 }}
              className="button secondary"
              onClick={() =>
                post<{ token: string }>(`/api/org/${cohort.id}/invite`, {})
                  .then((result) => setInvite(result.token))
                  .catch((e) => setError(e.message))
              }
            >
              Create invitation token
            </button>
          )}
          {invite && (
            <div className="share-result">
              <code>{invite}</code>
              <button
                className="button ghost"
                onClick={() =>
                  navigator.clipboard
                    .writeText(invite)
                    .catch(() => setError("Copy the token manually."))
                }
              >
                Copy
              </button>
            </div>
          )}
          {cohort.dimensions && (
            <div className="metrics-grid">
              {Object.entries(cohort.dimensions).map(([key, value]) => (
                <Metric key={key} label={key.toUpperCase()} value={value} />
              ))}
            </div>
          )}
          {cohort.comparison && (
            <CohortComparisonView value={cohort.comparison} />
          )}
          <button
            className="button danger"
            style={{ marginTop: 20 }}
            onClick={() => {
              if (
                window.confirm(
                  cohort.role === "owner"
                    ? "Delete this cohort?"
                    : "Leave this cohort?",
                )
              )
                api(`/api/org/${cohort.id}/membership`, { method: "DELETE" })
                  .then(() => {
                    setCohort(undefined);
                    void load();
                  })
                  .catch((e) => setError(e.message));
            }}
          >
            {cohort.role === "owner" ? "Delete cohort" : "Leave cohort"}
          </button>
        </section>
      )}
    </>
  );
}

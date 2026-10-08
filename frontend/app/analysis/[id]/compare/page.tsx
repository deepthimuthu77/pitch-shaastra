"use client";
import { use, useEffect, useState } from "react";
import { api, post } from "@/lib/api";
import type { Analysis } from "@/lib/types";
import { ErrorBox, Metric, money } from "@/components/ui";
import Link from "next/link";
type Digest = {
  title: string;
  version: number;
  sam: number | null;
  revenue: number | null;
  funding: number | null;
  wedge: string;
  risk_count: number;
};
type Comparison = {
  before: Digest;
  after: Digest;
  deltas: Record<string, number | null>;
};
export default function Compare({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [before, setBefore] = useState("");
  const [data, setData] = useState<Comparison>();
  const [error, setError] = useState("");
  useEffect(() => {
    setBefore(new URLSearchParams(window.location.search).get("before") || "");
    api<Analysis[]>("/api/analysis")
      .then(setAnalyses)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (before)
      post<Comparison>("/api/analysis/compare", { before, after: id })
        .then(setData)
        .catch((e) => setError(e.message));
  }, [before, id]);
  const currency = analyses.find((a) => a.id === id)?.inputs.currency || "USD",
    locale = analyses.find((a) => a.id === id)?.inputs.locale || "intl";
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PIVOT COMPARISON</span>
          <h1>What changed? What improved?</h1>
          <p>
            Compare model outputs, not promises. Different currencies and
            horizons are not directly comparable.
          </p>
        </div>
        <Link className="button ghost" href={`/analysis/${id}`}>
          Back to report
        </Link>
      </div>
      <label>
        Compare against
        <select value={before} onChange={(e) => setBefore(e.target.value)}>
          <option value="">Choose an earlier analysis</option>
          {analyses
            .filter((a) => a.id !== id)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} · version {a.version} · {a.inputs.currency}
              </option>
            ))}
        </select>
      </label>
      {error && <ErrorBox error={error} />}
      <div className="compare-layout" style={{ marginTop: 25 }}>
        {data &&
          [data.before, data.after].map((item, i) => (
            <section className="card" key={i}>
              <span className="eyebrow">
                {i ? "AFTER" : "BEFORE"} · VERSION {item.version}
              </span>
              <h2>{item.title}</h2>
              <Metric
                label="BOTTOM-UP SERVICEABLE MARKET"
                value={money(item.sam, currency, locale)}
              />
              <Metric
                label="END-HORIZON ARR"
                value={money(item.revenue, currency, locale)}
              />
              <Metric
                label="MEDIAN FUNDING NEED"
                value={money(item.funding, currency, locale)}
              />
              <h3 style={{ marginTop: 22 }}>Recommended wedge</h3>
              <p>{item.wedge || "Not available"}</p>
              <p>{item.risk_count} identified risk hypotheses</p>
              {i === 1 && (
                <div>
                  <h3>Deltas</h3>
                  {Object.entries(data.deltas).map(([key, value]) => (
                    <div className="comparison-delta" key={key}>
                      {key}:{" "}
                      {value == null
                        ? "not available"
                        : `${value >= 0 ? "+" : ""}${key === "risk_count" ? value : money(value, currency, locale)}`}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
      </div>
    </>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Download,
  Link2,
  Printer,
  RefreshCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { api, download, post, progressStream, API } from "@/lib/api";
import type {
  Analysis,
  Assumption,
  ModelPreview,
  Range,
  Sections,
} from "@/lib/types";
import { Badge, Empty, ErrorBox, Loading, Metric, money } from "./ui";
import { RevenueChart, Tornado } from "./charts";

const tabs = [
  "Summary",
  "Market",
  "Revenue",
  "Unit economics",
  "Competitors",
  "Wedges",
  "Moat",
  "Risks",
  "Funding",
  "Assumptions",
  "Claim check",
  "Sources",
];
type Share = {
  id: string;
  expires_at: number;
  revoked: boolean;
  sections: string[];
};

export function AnalysisReport({ id, token }: { id?: string; token?: string }) {
  const [printAll, setPrintAll] = useState(false);
  const [data, setData] = useState<Analysis>();
  const [tab, setTab] = useState("Summary");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ModelPreview>();
  const [overrides, setOverrides] = useState<Record<string, Range>>({});
  const [whatIf, setWhatIf] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shares, setShares] = useState<Share[]>([]);
  const [shareSections, setShareSections] = useState([
    "market",
    "revenue",
    "unit_economics",
    "competitors",
    "wedges",
    "risks",
    "sources",
  ]);
  const [shareHours, setShareHours] = useState(72);
  const [weights, setWeights] = useState<Record<string, number>>();
  const sequence = useRef(0);
  useEffect(() => {
    const done = () => setPrintAll(false);
    window.addEventListener("afterprint", done);
    return () => window.removeEventListener("afterprint", done);
  }, []);
  function printReport() {
    setPrintAll(true);
    setTimeout(() => window.print(), 500);
  }
  async function load() {
    try {
      const result = token
        ? await fetch(`${API}/api/public/analysis/${token}`).then(async (r) => {
            if (!r.ok)
              throw new Error("Share expired, revoked or unavailable.");
            return r.json() as Promise<Analysis>;
          })
        : await api<Analysis>(`/api/analysis/${id}`);
      setData(result);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, [id, token]);
  useEffect(() => {
    if (!data || token || !["queued", "running"].includes(data.status)) return;
    const controller = new AbortController();
    void progressStream(
      `/api/analysis/${id}/stream`,
      () => {
        void load();
      },
      controller.signal,
    ).catch(() => {});
    const interval = setInterval(() => {
      void load();
    }, 5000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [id, token, data?.status]);
  useEffect(() => {
    if (
      !id ||
      !data ||
      data.status === "running" ||
      (!Object.keys(overrides).length && !weights)
    )
      return;
    const current = ++sequence.current;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setBusy(true);
      api<ModelPreview>(`/api/analysis/${id}/recompute`, {
        method: "POST",
        body: JSON.stringify({ overrides, weights }),
        signal: controller.signal,
      })
        .then((result) => {
          if (current === sequence.current) setPreview(result);
        })
        .catch((e) => {
          if (current === sequence.current && e.name !== "AbortError")
            setError(e.message);
        })
        .finally(() => {
          if (current === sequence.current) setBusy(false);
        });
    }, 300);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [id, overrides, weights]);
  async function action(path: string, body: unknown, navigate = false) {
    setBusy(true);
    setError("");
    try {
      const result = await post<{ analysis_id?: string; note?: string }>(
        path,
        body,
      );
      if (navigate && result.analysis_id)
        window.location.href = `/analysis/${result.analysis_id}`;
      else await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function listShares() {
    try {
      setShares(await api<Share[]>(`/api/analysis/${id}/shares`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function createShare() {
    setBusy(true);
    try {
      const result = await post<{ url: string }>(`/api/analysis/${id}/share`, {
        sections: shareSections,
        expires_hours: shareHours,
      });
      setShareUrl(result.url);
      await listShares();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return error ? (
      <ErrorBox error={error} retry={load} />
    ) : (
      <Loading text="Opening the analysis report" />
    );
  const currency = data.inputs.currency,
    locale = data.inputs.locale,
    fmt = (value: number | null | undefined) => money(value, currency, locale);
  const sections: Sections = preview
    ? {
        ...data.sections,
        market: preview.market,
        revenue: {
          scenarios: preview.scenarios,
          simulation: preview.simulation,
          flags: preview.flags,
        },
        unit_economics: preview.unit_economics,
        sensitivity: preview.sensitivity,
        assumptions: preview.assumptions,
        wedges: preview.wedges,
        funding: {
          ...data.sections.funding!,
          need: preview.simulation.funding_need,
          breakeven_month: preview.scenarios.base.breakeven_month,
        },
      }
    : data.sections;
  const scenarios = sections.revenue?.scenarios,
    base = scenarios?.base,
    unit = sections.unit_economics?.base,
    assumptions = sections.assumptions || [];
  const running = ["queued", "running"].includes(data.status);
  const tabAvailable = (name: string) =>
    ({
      Summary: true,
      Market: !!sections.market,
      Revenue: !!sections.revenue,
      "Unit economics": !!unit,
      Competitors: !!sections.competitors,
      Wedges: !!sections.wedges,
      Moat: !!sections.moat,
      Risks: !!sections.risks,
      Funding: !!sections.funding,
      Assumptions: !!sections.assumptions,
      "Claim check": !!sections.claim_check,
      Sources: !!sections.sources,
    })[name];
  return (
    <div className="analysis-report print-report">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PITCHGRILL ANALYTICS / IDEA REPORT</span>
          <h1>
            {data.title}
            <span className="mint-dot">.</span>
          </h1>
          <div className="inline-meta">
            <Badge
              tone={
                data.status === "failed" ? "coral" : running ? "amber" : "green"
              }
            >
              {data.status}
            </Badge>
            <span>Version {data.version}</span>
            <span>{data.inputs.geography}</span>
            <span>{data.inputs.horizon_months}-month model</span>
            {data.is_synthetic && <Badge tone="amber">Illustrative demo</Badge>}
            {data.stale && <Badge tone="amber">Research is stale</Badge>}
          </div>
        </div>
        <div className="button-row no-print">
          <button className="button ghost" onClick={printReport}>
            <Printer size={14} />
            PDF
          </button>
          {!token && (
            <>
              <button
                className="button ghost"
                onClick={() => {
                  setShareOpen(!shareOpen);
                  void listShares();
                }}
              >
                <Link2 size={14} />
                Share
              </button>
              <button
                className="button primary"
                disabled={running}
                onClick={() => setWhatIf(!whatIf)}
              >
                <SlidersHorizontal size={15} />
                What if?
              </button>
            </>
          )}
        </div>
      </div>
      {error && <ErrorBox error={error} retry={() => setError("")} />}
      {running && (
        <section className="card progress-card">
          <span className="eyebrow">REAL WORK, REAL PROGRESS</span>
          <h2>Building your analysis.</h2>
          <p>
            The pitch room stays available while research runs. Stage durations
            below are measured, not scripted.
          </p>
          <div className="stage-track">
            {Object.entries(data.progress || {}).map(([name, stage]) => (
              <div key={name} className={stage.status}>
                <span>
                  {stage.status === "done"
                    ? "✓"
                    : stage.status === "running"
                      ? "◉"
                      : "○"}
                </span>
                <strong>{name}</strong>
                <small>
                  {stage.ms != null ? `${stage.ms}ms` : stage.status}
                </small>
              </div>
            ))}
          </div>
          {data.pitch_id && (
            <Link className="button secondary" href={`/pitch/${data.pitch_id}`}>
              Return to the pitch <ArrowRight size={15} />
            </Link>
          )}
        </section>
      )}
      {data.error && (
        <ErrorBox
          error={data.error}
          retry={() => {
            void action(`/api/analysis/${id}/rerun`, {}, true);
          }}
        />
      )}
      {data.is_synthetic && (
        <div className="demo-note">
          <Badge tone="amber">ILLUSTRATIVE, NOT RESEARCHED</Badge>No external AI
          or search was called. Planning defaults and coaching hypotheses are
          visible below. Published market facts and verified competitors remain
          unavailable.
        </div>
      )}
      {data.warnings?.map((warning, i) => (
        <div className="report-warning" key={i}>
          {warning}
        </div>
      ))}
      {shareOpen && !token && (
        <section className="card share-controls no-print">
          <h2>Share only what you choose.</h2>
          <p>
            The idea title will be visible. Select report sections carefully;
            assumptions and claim checks are private unless you include them.
            Links are read-only, expiring and revocable.
          </p>
          <div className="share-section-list">
            {Object.keys(data.sections)
              .filter((name) => name !== "facts")
              .map((name) => (
                <label className="checkbox" key={name}>
                  <input
                    type="checkbox"
                    checked={shareSections.includes(name)}
                    onChange={(e) =>
                      setShareSections((prior) =>
                        e.target.checked
                          ? [...prior, name]
                          : prior.filter((item) => item !== name),
                      )
                    }
                  />
                  {name.replaceAll("_", " ")}
                </label>
              ))}
          </div>
          <div className="button-row">
            <label>
              Expires after
              <select
                value={shareHours}
                onChange={(e) => setShareHours(Number(e.target.value))}
              >
                <option value={24}>24 hours</option>
                <option value={72}>3 days</option>
                <option value={168}>7 days</option>
              </select>
            </label>
            <button
              className="button primary"
              disabled={busy || !shareSections.length}
              onClick={createShare}
            >
              Create read-only link
            </button>
          </div>
          {shareUrl && (
            <div className="share-result">
              <a href={shareUrl} target="_blank" rel="noreferrer">
                {shareUrl}
              </a>
              <button
                className="button ghost"
                onClick={() =>
                  navigator.clipboard
                    .writeText(shareUrl)
                    .catch(() => setError("Copy the link manually."))
                }
              >
                Copy
              </button>
            </div>
          )}
          {shares.map((share) => (
            <div className="share-row" key={share.id}>
              <span>
                {share.revoked ? "Revoked" : "Read-only link"} · Expires{" "}
                {new Date(share.expires_at * 1000).toLocaleString()}
              </span>
              <button
                className="text-button"
                disabled={share.revoked}
                onClick={() =>
                  api(`/api/analysis/share/${share.id}`, { method: "DELETE" })
                    .then(listShares)
                    .catch((e) => setError(e.message))
                }
              >
                Revoke
              </button>
            </div>
          ))}
        </section>
      )}
      {whatIf && !token && (
        <section className="card what-if no-print">
          <div className="card-heading">
            <div>
              <span className="eyebrow">YOUR ASSUMPTIONS. YOUR SCENARIO.</span>
              <h2>What changes if you&apos;re wrong?</h2>
              <p>
                Calculated in Python. No AI calls. Previews do not overwrite
                this version.
              </p>
            </div>
            <Badge tone="green">
              {busy ? "Recomputing…" : "0 model calls"}
            </Badge>
          </div>
          <div className="slider-grid">
            {assumptions.map((a) => (
              <AssumptionSlider
                key={a.key}
                assumption={a}
                value={
                  overrides[a.key] || a.value || { low: 0, base: 0, high: 0 }
                }
                onChange={(value) =>
                  setOverrides((prior) => ({ ...prior, [a.key]: value }))
                }
              />
            ))}
          </div>
          <div className="button-row">
            <button
              className="button secondary"
              disabled={!preview || busy}
              onClick={() => {
                void action(
                  `/api/analysis/${id}/version`,
                  { overrides, weights },
                  true,
                );
              }}
            >
              <Save size={14} />
              Save scenario as a new version
            </button>
            <button
              className="button ghost"
              onClick={() => {
                setOverrides({});
                setPreview(undefined);
                setWeights(undefined);
              }}
            >
              Reset preview
            </button>
          </div>
        </section>
      )}
      <div
        className="report-tabs no-print"
        role="tablist"
        aria-label="Analysis sections"
      >
        {tabs.filter(tabAvailable).map((name) => (
          <button
            role="tab"
            aria-selected={tab === name}
            key={name}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={tab}>
        {(printAll || tab === "Summary") && (
          <>
            <div className="metrics-grid">
              <Metric
                label="BOTTOM-UP SERVICEABLE MARKET"
                value={fmt(sections.market?.base.sam_bottom_up)}
                note="Accounts × monthly price × 12"
              />
              <Metric
                label="BASE END-HORIZON ARR"
                value={fmt(base?.arr_end)}
                note="Annualized final-month revenue"
              />
              <Metric
                label="MEDIAN FUNDING NEED"
                value={fmt(sections.funding?.need.p50)}
                note="Peak cumulative model deficit"
              />
              <Metric
                label="EVIDENCE CONFIDENCE"
                value={data.confidence?.level || "Pending"}
                note={`${data.confidence?.source_count || 0} cited sources · ${Math.round((data.confidence?.sourced_share || 0) * 100)}% sourced inputs`}
              />
            </div>
            {data.profile && (
              <div className="card profile-card">
                <div>
                  <span className="eyebrow">THE IDEA, NORMALIZED</span>
                  <h2>{data.profile.segment}</h2>
                  <p>{data.profile.problem}</p>
                </div>
                <div>
                  <Badge>{data.profile.industry}</Badge>
                  <Badge>{data.profile.stage.replaceAll("_", " ")}</Badge>
                  <p>{data.profile.business_model}</p>
                  <p>{data.profile.solution}</p>
                </div>
              </div>
            )}
            <div className="signals-grid">
              {data.signals?.map((signal) => (
                <div
                  className={`signal-tile ${signal.status}`}
                  key={signal.name}
                >
                  <span className="signal-light" />
                  <h3>{signal.name}</h3>
                  <Badge
                    tone={
                      signal.status === "green"
                        ? "green"
                        : signal.status === "red"
                          ? "coral"
                          : signal.status === "unknown"
                            ? "neutral"
                            : "amber"
                    }
                  >
                    {signal.status}
                  </Badge>
                  <p>{signal.detail}</p>
                </div>
              ))}
            </div>
            <section className="card">
              <ShieldCheck size={22} />
              <h2>Evidence before confidence.</h2>
              <p>
                {data.confidence?.rule ||
                  "Confidence will be assessed when the report is assembled."}
              </p>
              <p>{sections.narrative?.text}</p>
              <p>{sections.narrative?.method}</p>
              {preview && (
                <Badge tone="amber">
                  Scenario preview · summary signals describe the saved version
                </Badge>
              )}
            </section>
            {base && sections.revenue && (
              <section className="card">
                <div className="card-heading">
                  <h2>One idea. Three possible paths.</h2>
                  <button
                    className="text-button"
                    onClick={() => setTab("Revenue")}
                  >
                    Explore projections →
                  </button>
                </div>
                <RevenueChart
                  scenarios={sections.revenue.scenarios}
                  simulation={sections.revenue.simulation}
                  currency={currency}
                  locale={locale}
                />
              </section>
            )}
          </>
        )}
        {(printAll || tab === "Market") && sections.market && (
          <>
            <div className="section-heading">
              <div>
                <span className="eyebrow">
                  TWO METHODS. VISIBLE UNCERTAINTY.
                </span>
                <h2>How big is the reachable opportunity?</h2>
              </div>
              <Badge
                tone={
                  sections.market.agreement.available
                    ? sections.market.agreement.disagree
                      ? "coral"
                      : "green"
                    : "amber"
                }
              >
                {!sections.market.agreement.available
                  ? "Top-down unavailable"
                  : sections.market.agreement.disagree
                    ? "Methods disagree >3×"
                    : "Methods agree within 3×"}
              </Badge>
            </div>
            <div className="market-funnel">
              {[
                { name: "TAM", key: "tam" },
                { name: "SAM · top-down", key: "sam_top_down" },
                { name: "SOM · top-down", key: "som_top_down" },
                { name: "SAM · bottom-up", key: "sam_bottom_up" },
                { name: "SOM · bottom-up", key: "som_bottom_up" },
              ].map((item, i) => (
                <div
                  key={item.key}
                  style={
                    { "--funnel": `${100 - i * 9}%` } as React.CSSProperties
                  }
                >
                  <strong>{item.name}</strong>
                  <span>
                    {fmt(
                      sections.market!.base[
                        item.key as keyof typeof sections.market.base
                      ],
                    )}
                  </span>
                  <small>
                    {fmt(
                      sections.market!.low[
                        item.key as keyof typeof sections.market.base
                      ],
                    )}{" "}
                    –{" "}
                    {fmt(
                      sections.market!.high[
                        item.key as keyof typeof sections.market.base
                      ],
                    )}
                  </small>
                </div>
              ))}
            </div>
            <section className="card">
              <h3>How these ranges are produced</h3>
              <p>
                Top-down: sourced total market × serviceable fraction ×
                obtainable fraction. Bottom-up: target accounts × monthly price
                × annual months; obtainable market adds adoption share.
              </p>
              <p>
                Planning defaults remain assumptions. Missing published figures
                are unavailable. Market-growth facts:{" "}
                {data.sections.facts
                  ?.filter((f) => f.topic === "market")
                  .map((f) => f.note)
                  .join(" ") || "not found"}
                .
              </p>
              <p>
                Timing drivers:{" "}
                {sections.narrative?.why_now.join(" ") || "not researched"}
              </p>
            </section>
          </>
        )}
        {(printAll || tab === "Revenue") && sections.revenue && (
          <>
            <div className="metrics-grid">
              <Metric
                label="P10 / P50 / P90 ARR"
                value={fmt(sections.revenue.simulation.arr_end.p50)}
                note={`${fmt(sections.revenue.simulation.arr_end.p10)} – ${fmt(sections.revenue.simulation.arr_end.p90)}`}
              />
              <Metric
                label="BASE BREAK-EVEN MONTH"
                value={base?.breakeven_month ?? "Not within horizon"}
                note="First month with nonnegative net operating cash"
              />
              <Metric
                label="BASE END CUSTOMERS"
                value={Math.round(base?.customers_end || 0).toLocaleString()}
                note="Subject to the target-account ceiling"
              />
              <Metric
                label="SIMULATION"
                value={sections.revenue.simulation.runs}
                note={`Reproducible runs · seed ${sections.revenue.simulation.seed}`}
              />
            </div>
            <section className="card">
              <h2>Monthly revenue & uncertainty</h2>
              <RevenueChart
                scenarios={sections.revenue.scenarios}
                simulation={sections.revenue.simulation}
                currency={currency}
                locale={locale}
              />
              <p>{sections.revenue.simulation.method}</p>
              {sections.revenue.flags.map((flag) => (
                <div className="report-warning" key={flag}>
                  {flag}
                </div>
              ))}
            </section>
            <section className="card">
              <h2>Annual revenue rollups</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Pessimistic</th>
                      <th>Base</th>
                      <th>Optimistic</th>
                    </tr>
                  </thead>
                  <tbody>
                    {base?.annual_revenue.map((value, i) => (
                      <tr key={i}>
                        <td>Year {i + 1}</td>
                        <td>{fmt(scenarios?.pessimistic.annual_revenue[i])}</td>
                        <td>{fmt(value)}</td>
                        <td>{fmt(scenarios?.optimistic.annual_revenue[i])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            {sections.sensitivity && (
              <section className="card">
                <h2>Which assumption matters most?</h2>
                <p>
                  End-horizon ARR swing when one assumption moves across its
                  range, holding the rest at base.
                </p>
                <Tornado
                  items={sections.sensitivity.items}
                  currency={currency}
                  locale={locale}
                />
              </section>
            )}
            <details className="card">
              <summary>Inspect month-by-month base calculations</summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Customers</th>
                      <th>Revenue</th>
                      <th>Net cash</th>
                      <th>Cumulative cash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {base?.rows.map((row) => (
                      <tr key={row.month}>
                        <td>{row.month}</td>
                        <td>{row.customers.toFixed(1)}</td>
                        <td>{fmt(row.revenue)}</td>
                        <td>{fmt(row.net)}</td>
                        <td>{fmt(row.cash)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
        {(printAll || tab === "Unit economics") && unit && (
          <>
            <div className="metrics-grid">
              <Metric
                label="MONTHLY ARPU"
                value={fmt(unit.arpu)}
                note="Revenue per active customer"
              />
              <Metric
                label="GROSS MARGIN"
                value={`${Math.round(unit.gross_margin * 100)}%`}
                note="Before acquisition and fixed costs"
              />
              <Metric
                label="LIFETIME VALUE"
                value={fmt(unit.ltv)}
                note={`Gross-profit lifetime · capped at ${unit.lifetime_months.toFixed(1)} months`}
              />
              <Metric
                label="LTV / CAC"
                value={unit.ltv_cac?.toFixed(1) ?? "n/a"}
                note="Zero CAC is unavailable, not infinite"
              />
            </div>
            <section className="card">
              <h2>Economics across scenarios</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Scenario</th>
                      <th>CAC</th>
                      <th>LTV</th>
                      <th>LTV / CAC</th>
                      <th>Payback months</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(sections.unit_economics!).map(
                      ([name, u]) => (
                        <tr key={name}>
                          <td>{name}</td>
                          <td>{fmt(u.cac)}</td>
                          <td>{fmt(u.ltv)}</td>
                          <td>{u.ltv_cac?.toFixed(1) ?? "n/a"}</td>
                          <td>{u.payback_months?.toFixed(1) ?? "n/a"}</td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
              <p>
                LTV = monthly ARPU × gross margin × min(1/churn, horizon).
                Payback = CAC / monthly gross profit. These exclude taxes,
                discounting and working capital.
              </p>
            </section>
          </>
        )}
        {(printAll || tab === "Competitors") && sections.competitors && (
          <>
            <div className="card-heading">
              <div>
                <h2>What customers use instead.</h2>
                <p>
                  Crowdedness: {sections.competitors.crowdedness}. Positioning
                  values are subjective judgments.
                </p>
              </div>
              {!token && (
                <button
                  className="button ghost"
                  disabled={busy}
                  onClick={() => {
                    void action(
                      `/api/analysis/${id}/rerun`,
                      { section: "competitors" },
                      true,
                    );
                  }}
                >
                  <RefreshCcw size={14} />
                  Refresh in new version
                </button>
              )}
            </div>
            <div
              className="positioning-map"
              role="img"
              aria-label="Competitor positioning based on subjective assessments"
            >
              <span className="axis-y">{sections.competitors.axis_y}</span>
              <span className="axis-x">{sections.competitors.axis_x}</span>
              {sections.competitors.competitors.map((c, i) => (
                <div
                  key={i}
                  className={`competitor-bubble ${c.verified ? "verified" : ""}`}
                  style={{
                    left: `${10 + c.map_x * 0.75}%`,
                    bottom: `${12 + c.map_y * 0.65}%`,
                  }}
                >
                  <span>{c.name}</span>
                  <small>{c.verified ? "Cited" : "Unverified"}</small>
                </div>
              ))}
            </div>
            <div className="competitor-grid">
              {sections.competitors.competitors.map((c, i) => (
                <section className="card" key={i}>
                  <div className="card-heading">
                    <h3>{c.name}</h3>
                    <Badge tone={c.verified ? "green" : "amber"}>
                      {c.verified ? "Source supported" : "Unverified"}
                    </Badge>
                  </div>
                  <Badge>{c.type}</Badge>
                  <Badge tone={c.threat === "high" ? "coral" : "neutral"}>
                    {c.threat} threat · judgment
                  </Badge>
                  <p>{c.what_they_do}</p>
                  <dl>
                    <dt>Customer</dt>
                    <dd>{c.target_customer}</dd>
                    <dt>Pricing</dt>
                    <dd>{c.pricing || "Not found"}</dd>
                    <dt>Scale</dt>
                    <dd>{c.scale_signals || "Not found"}</dd>
                    <dt>Strengths</dt>
                    <dd>{c.strengths.join(" · ")}</dd>
                    <dt>Weaknesses</dt>
                    <dd>{c.weaknesses.join(" · ")}</dd>
                  </dl>
                  <small>Source IDs: {c.source_ids.join(", ") || "None"}</small>
                </section>
              ))}
            </div>
            <section className="card">
              <h3>Feature and overlap comparison</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Alternative</th>
                      <th>Overlap</th>
                      <th>Threat</th>
                      <th>Pricing found</th>
                      <th>Cited</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sections.competitors.competitors.map((c) => (
                      <tr key={c.name}>
                        <td>{c.name}</td>
                        <td>{c.overlap}</td>
                        <td>{c.threat}</td>
                        <td>{c.pricing ? "Yes" : "No"}</td>
                        <td>{c.verified ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Possible incumbent response:{" "}
                {sections.competitors.incumbent_response}
              </p>
            </section>
          </>
        )}
        {(printAll || tab === "Wedges") && sections.wedges && (
          <>
            <section className="card">
              <span className="eyebrow">
                START NARROW. EARN THE RIGHT TO EXPAND.
              </span>
              <h2>{sections.wedges.recommended}</h2>
              <p>
                Weighted judgments, not proven advantages.{" "}
                {sections.wedges.stability}
              </p>
              <div className="wedge-weights">
                {Object.entries(sections.wedges.weights).map(([key, value]) => (
                  <label key={key}>
                    {key.replaceAll("_", " ")}
                    <input
                      disabled={!!token}
                      type="number"
                      min="0"
                      max="1"
                      step=".05"
                      value={weights?.[key] ?? value}
                      onChange={(e) =>
                        setWeights((prior) => ({
                          ...sections.wedges!.weights,
                          ...prior,
                          [key]: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            </section>
            <div className="wedge-list">
              {sections.wedges.items.map((w, i) => (
                <section className="card wedge-card" key={w.name}>
                  <span className="wedge-rank">0{i + 1}</span>
                  <div>
                    <div className="card-heading">
                      <h3>{w.name}</h3>
                      <strong className="wedge-score">
                        {w.total}
                        <small>/100</small>
                      </strong>
                    </div>
                    <Badge>{w.kind}</Badge>
                    <p>{w.description}</p>
                    <div className="wedge-score-bars">
                      {Object.entries(w.scores).map(([key, value]) => (
                        <div key={key}>
                          <span>{key.replaceAll("_", " ")}</span>
                          <div>
                            <i style={{ width: `${value * 20}%` }} />
                          </div>
                          <small>{value}/5</small>
                        </div>
                      ))}
                    </div>
                    <p>{w.why_it_works}</p>
                    <h4>What must be true</h4>
                    <ul>
                      {w.what_must_be_true.map((text) => (
                        <li key={text}>{text}</li>
                      ))}
                    </ul>
                    <div className="expansion-path">{w.expansion_path}</div>
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
        {(printAll || tab === "Moat") && sections.moat && (
          <>
            <h2>What becomes harder to copy?</h2>
            <p>
              Strength today and time to build are subjective hypotheses.
              Missing timelines remain unknown.
            </p>
            <div className="competitor-grid">
              {sections.moat.map((m, i) => (
                <section className="card" key={i}>
                  <Badge>{m.type.replaceAll("_", " ")}</Badge>
                  <h2>
                    {m.strength_today}
                    <small>/5 today</small>
                  </h2>
                  <p>{m.reasoning}</p>
                  <small>
                    Time to build:{" "}
                    {m.months_to_build == null
                      ? "not estimated"
                      : `${m.months_to_build} months`}
                  </small>
                </section>
              ))}
            </div>
          </>
        )}
        {(printAll || tab === "Risks") && sections.risks && (
          <>
            <div className="risk-layout">
              <section className="card">
                <h2>Likelihood × impact</h2>
                <p>Subjective risk judgments, with visible thresholds.</p>
                <div className="risk-matrix">
                  {[5, 4, 3, 2, 1].flatMap((impact) =>
                    [1, 2, 3, 4, 5].map((likelihood) => (
                      <div
                        key={`${impact}-${likelihood}`}
                        className={
                          impact * likelihood >= 15
                            ? "high"
                            : impact * likelihood >= 8
                              ? "medium"
                              : "low"
                        }
                        title={`Impact ${impact}, likelihood ${likelihood}`}
                      >
                        {sections
                          .risks!.filter(
                            (r) =>
                              r.impact === impact &&
                              r.likelihood === likelihood,
                          )
                          .map((r, i) => (
                            <span key={i} title={r.title}>
                              ●
                            </span>
                          ))}
                      </div>
                    )),
                  )}
                </div>
                <small>
                  Impact increases upward · Likelihood increases rightward
                </small>
              </section>
              <section className="card">
                <h2>Know when to stop or pivot.</h2>
                <p>
                  A kill criterion turns uncertainty into an experiment with an
                  honest decision point.
                </p>
                {sections.risks
                  .filter((r) => r.score >= 15)
                  .map((r) => (
                    <div className="kill-criterion" key={r.title}>
                      <strong>{r.title}</strong>
                      <p>{r.kill_criterion}</p>
                    </div>
                  ))}
              </section>
            </div>
            <div className="competitor-grid">
              {sections.risks.map((r) => (
                <section className="card" key={r.title}>
                  <Badge tone={r.band === "high" ? "coral" : "amber"}>
                    {r.score}/25 · {r.band}
                  </Badge>
                  <h3>{r.title}</h3>
                  <dl>
                    <dt>Watch for</dt>
                    <dd>{r.early_warning}</dd>
                    <dt>Mitigation</dt>
                    <dd>{r.mitigation}</dd>
                    <dt>Stop / pivot if</dt>
                    <dd>{r.kill_criterion}</dd>
                  </dl>
                </section>
              ))}
            </div>
            <section className="card">
              <h2>Regulatory pointers</h2>
              <p>
                Research starting points requiring professional review, not
                legal advice.
              </p>
              {sections.regulatory?.map((r, i) => (
                <div className="regulatory-item" key={i}>
                  <Badge tone={r.verified ? "green" : "amber"}>
                    {r.verified ? "Cited pointer" : "Unverified"}
                  </Badge>
                  <h3>
                    {r.area} · {r.jurisdiction}
                  </h3>
                  <p>{r.requirement}</p>
                  <p>{r.impact}</p>
                  <small>Sources: {r.source_ids.join(", ") || "none"}</small>
                </div>
              ))}
            </section>
          </>
        )}
        {(printAll || tab === "Funding") && sections.funding && (
          <>
            <div className="metrics-grid">
              <Metric
                label="P10 FUNDING NEED"
                value={fmt(sections.funding.need.p10)}
                note="Peak model deficit"
              />
              <Metric
                label="MEDIAN FUNDING NEED"
                value={fmt(sections.funding.need.p50)}
                note="Peak model deficit"
              />
              <Metric
                label="P90 FUNDING NEED"
                value={fmt(sections.funding.need.p90)}
                note="High-deficit sampled outcome"
              />
              <Metric
                label="BASE BREAK-EVEN"
                value={
                  sections.funding.breakeven_month
                    ? `Month ${sections.funding.breakeven_month}`
                    : "Not within horizon"
                }
              />
            </div>
            <section className="card">
              <h2>What the model funds.</h2>
              <p>{sections.funding.runway_note}</p>
              <p>
                The model covers customer acquisition, delivery gross margin and
                fixed operating costs. Taxes, working capital, financing costs
                and exceptional spending are excluded.
              </p>
              <h3>Comparable rounds</h3>
              {sections.funding.comparable_rounds.length ? (
                sections.funding.comparable_rounds.map((r, i) => (
                  <p key={i}>
                    {r.note} · source {r.source_id}
                  </p>
                ))
              ) : (
                <p>Not found. No comparable financing figures are invented.</p>
              )}
            </section>
          </>
        )}
        {(printAll || tab === "Assumptions") && (
          <section className="card">
            <h2>Every number has an origin.</h2>
            <p>
              Source-supported, founder-provided, estimated or an explicit
              planning default. Click “What if?” to challenge the ranges.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Assumption</th>
                    <th>Low</th>
                    <th>Base</th>
                    <th>High</th>
                    <th>Origin</th>
                    <th>Rationale</th>
                  </tr>
                </thead>
                <tbody>
                  {assumptions.map((a) => (
                    <tr key={a.key}>
                      <td>
                        <strong>{a.label}</strong>
                        <small>{a.unit}</small>
                      </td>
                      <td>{a.value?.low.toLocaleString() ?? "n/a"}</td>
                      <td>{a.value?.base.toLocaleString() ?? "n/a"}</td>
                      <td>{a.value?.high.toLocaleString() ?? "n/a"}</td>
                      <td>
                        <Badge
                          tone={
                            a.provenance === "sourced"
                              ? "green"
                              : a.provenance === "founder"
                                ? "mint"
                                : "amber"
                          }
                        >
                          {a.provenance.replaceAll("_", " ")}
                        </Badge>
                        <small>{a.fact_ids.join(", ")}</small>
                      </td>
                      <td>{a.rationale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {(printAll || tab === "Claim check") && (
          <section className="card">
            <div className="card-heading">
              <h2>Does the pitch match the model?</h2>
              {!token && (
                <button
                  className="button ghost"
                  disabled={busy}
                  onClick={() => {
                    void action(`/api/analysis/${id}/claim-check`, {});
                  }}
                >
                  <RefreshCcw size={14} />
                  Check transcript
                </button>
              )}
            </div>
            <p>
              Consistency means within the model&apos;s assumption-driven range.
              It does not prove a statement true. Missing research is
              unverifiable.
            </p>
            {!sections.claim_check?.length ? (
              <Empty
                title="No grounded claims to compare yet."
                text="A completed pitch can contribute explicit numeric and competition claims. We do not turn missing evidence into contradictions."
              />
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Founder claim</th>
                      <th>Verdict</th>
                      <th>Basis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sections.claim_check.map((c, i) => (
                      <tr key={i}>
                        <td>
                          <strong>{c.claim}</strong>
                          <blockquote>{c.quote}</blockquote>
                        </td>
                        <td>
                          <Badge
                            tone={
                              c.verdict === "consistent"
                                ? "green"
                                : c.verdict === "contradicted"
                                  ? "coral"
                                  : "amber"
                            }
                          >
                            {c.verdict}
                          </Badge>
                        </td>
                        <td>
                          {c.explanation}
                          <small>{c.basis}</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
        {(printAll || tab === "Sources") && (
          <section className="card">
            <h2>The receipts.</h2>
            <p>
              Short extracted notes and source links. Full articles are never
              republished. Search excerpts support pointers; independently
              verify material decisions.
            </p>
            {!sections.sources?.items.length ? (
              <Empty
                title="No external sources retrieved."
                text="Demo mode does not research the web. In live mode, approve generic search terms to retrieve cited sources."
              />
            ) : (
              sections.sources.items.map((source) => (
                <div className="source-item" key={source.id}>
                  <Badge>{source.id}</Badge>
                  <div>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {source.title} ↗
                    </a>
                    <small>
                      {source.publisher} · Retrieved{" "}
                      {new Date(source.retrieved * 1000).toLocaleDateString()} ·
                      Published {source.published || "unknown"}
                    </small>
                  </div>
                </div>
              ))
            )}
            {sections.sources?.search_suggestions.map((html, i) => (
              <iframe
                key={i}
                sandbox="allow-popups"
                title={`Google Search suggestions ${i + 1}`}
                srcDoc={html}
                className="google-search-suggestions"
              />
            ))}
          </section>
        )}
      </div>
      {!token && !running && (
        <div className="report-actions no-print">
          <button
            className="button ghost"
            onClick={() =>
              download(
                `/api/analysis/${id}/export?format=json`,
                `pitchgrill-${id}.json`,
              ).catch((e) => setError(e.message))
            }
          >
            <Download size={14} />
            JSON
          </button>
          <button
            className="button ghost"
            onClick={() =>
              download(
                `/api/analysis/${id}/export?format=csv`,
                `pitchgrill-${id}.csv`,
              ).catch((e) => setError(e.message))
            }
          >
            <Download size={14} />
            CSV assumptions
          </button>
          <button
            className="button ghost"
            disabled={busy}
            onClick={() => {
              void action(`/api/analysis/${id}/archive`, {});
            }}
          >
            Archive to Cloud Storage
          </button>
          <button
            className="button ghost"
            disabled={busy}
            onClick={() => {
              void action(`/api/analysis/${id}/rerun`, {}, true);
            }}
          >
            <RefreshCcw size={14} />
            Refresh research in new version
          </button>
          {data.parent_analysis_id && (
            <Link
              className="button ghost"
              href={`/analysis/${id}/compare?before=${data.parent_analysis_id}`}
            >
              Compare versions <ArrowRight size={14} />
            </Link>
          )}
          <button
            className="button danger"
            onClick={() => {
              if (
                window.confirm(
                  "Delete this analysis and invalidate its share links? This cannot be undone.",
                )
              )
                api(`/api/analysis/${id}`, { method: "DELETE" })
                  .then(() => {
                    window.location.href = "/analysis";
                  })
                  .catch((e) => setError(e.message));
            }}
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      )}
      {data.versions?.calls?.length ? (
        <details className="card">
          <summary>Real model-call metadata</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Provider / model</th>
                  <th>Elapsed</th>
                  <th>Reasoning tokens</th>
                </tr>
              </thead>
              <tbody>
                {data.versions.calls.map((m, i) => (
                  <tr key={i}>
                    <td>
                      {m.provider}/{m.model}
                    </td>
                    <td>{(m.ms / 1000).toFixed(2)}s</td>
                    <td>{m.reasoning_tokens ?? "not reported"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  );
}

function AssumptionSlider({
  assumption,
  value,
  onChange,
}: {
  assumption: Assumption;
  value: Range;
  onChange: (value: Range) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="assumption-slider">
      <div>
        <strong>{assumption.label}</strong>
        <Badge tone={assumption.provenance === "founder" ? "mint" : "neutral"}>
          {assumption.provenance.replaceAll("_", " ")}
        </Badge>
      </div>
      <span>
        {value.base.toLocaleString(undefined, { maximumFractionDigits: 4 })}{" "}
        <small>{assumption.unit}</small>
      </span>
      <input
        type="range"
        aria-label={assumption.label}
        min={value.low}
        max={value.high}
        step={(value.high - value.low) / 100 || 0.001}
        value={value.base}
        onChange={(e) => onChange({ ...value, base: Number(e.target.value) })}
      />
      <div className="slider-range">
        <small>{value.low.toLocaleString()}</small>
        <button className="text-button" onClick={() => setEditing(!editing)}>
          {editing ? "Close" : "Edit range"}
        </button>
        <small>{value.high.toLocaleString()}</small>
      </div>
      {editing && (
        <div className="range-inputs">
          {(["low", "base", "high"] as const).map((key) => (
            <label key={key}>
              {key}
              <input
                type="number"
                min="0"
                step="any"
                value={value[key]}
                onChange={(e) => {
                  const next = { ...value, [key]: Number(e.target.value) };
                  if (key === "low" && next.base < next.low)
                    next.base = next.low;
                  if (key === "high" && next.base > next.high)
                    next.base = next.high;
                  onChange(next);
                }}
              />
            </label>
          ))}
        </div>
      )}
      <details>
        <summary>Where does this number come from?</summary>
        <p>{assumption.rationale}</p>
        <small>
          {assumption.fact_ids.join(", ") || "No supporting fact linked"}
        </small>
      </details>
    </div>
  );
}

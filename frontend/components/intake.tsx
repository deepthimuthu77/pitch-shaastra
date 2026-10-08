"use client";
import { useEffect, useState } from "react";
import { ArrowRight, FlaskConical, LockKeyhole } from "lucide-react";
import { getConfig } from "@/lib/api";
import { Badge, ErrorBox } from "./ui";
import type { Config } from "@/lib/types";

export type IntakeBody = {
  idea: string;
  title: string;
  difficulty: string;
  geography: string;
  currency: string;
  locale: string;
  stage: string;
  target_customer: string;
  industry: string;
  price_guess: number | null;
  horizon_months: number;
  research_terms: string;
  research_consent: boolean;
  named_search_consent: boolean;
  known_competitors: string;
  cloud_consent: boolean;
  analytics_consent: boolean;
  parent_pitch_id?: string;
};
export const EXAMPLES = {
  weak: {
    title: "The everything app",
    idea: "We are building an AI assistant for everyone. It is a huge market and we have no competitors. Everyone needs this. Our platform will do everything for every business. We are going to grow fast and become the leader.",
    customer: "Everyone",
    industry: "business software",
  },
  decent: {
    title: "LocalLoop",
    idea: "LocalLoop helps independent neighborhood shops recover unsold stock by matching it with nearby buyers. Our first segment is small bakeries. We have interviewed 12 shop owners and are designing a prototype. Our price hypothesis is $50 a month per shop. We still need to validate retention and acquisition cost. Our team has retail operations experience.",
    customer: "Independent bakeries",
    industry: "retail inventory software",
  },
  strong: {
    title: "Shiftwise",
    idea: "Shiftwise helps independent clinics fill cancelled appointments. Our first segment is clinics with 3 to 10 practitioners. In a 6-week paid pilot, 8 clinics recovered 120 appointments and 6 asked to continue. They paid $80 a month. Our measured delivery cost was $12 per clinic monthly, and our small acquisition experiment cost $150 per paid clinic. We do not yet know long-term churn. Our operations lead ran clinic scheduling for 4 years. We minimize patient data and require explicit consent before sending reminders.",
    customer: "Independent clinics",
    industry: "clinic scheduling software",
  },
};

export function Intake({
  kind,
  initial,
  onSubmit,
  busy,
  error,
}: {
  kind: "pitch" | "analysis";
  initial?: Partial<IntakeBody>;
  onSubmit: (body: IntakeBody) => void;
  busy: boolean;
  error: string;
}) {
  const [config, setConfig] = useState<Config>();
  const [form, setForm] = useState<IntakeBody>({
    idea: "",
    title: "",
    difficulty: "vc",
    geography: "global",
    currency: "USD",
    locale: "intl",
    stage: "idea",
    target_customer: "",
    industry: "software",
    price_guess: null,
    horizon_months: 60,
    research_terms: "",
    research_consent: false,
    named_search_consent: false,
    known_competitors: "",
    cloud_consent: false,
    analytics_consent: false,
    ...initial,
  });
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch(() => {});
  }, []);
  const change = <K extends keyof IntakeBody>(key: K, value: IntakeBody[K]) =>
    setForm((prior) => ({ ...prior, [key]: value }));
  function example(key: keyof typeof EXAMPLES) {
    const item = EXAMPLES[key];
    setForm((prior) => ({
      ...prior,
      title: item.title,
      idea: item.idea,
      target_customer: item.customer,
      industry: item.industry,
      research_terms: item.industry,
    }));
  }
  return (
    <form
      className="intake-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
    >
      <div className="form-heading">
        <div>
          <span className="eyebrow">
            {kind === "pitch"
              ? "STEP INTO THE ROOM"
              : "THE PRODUCT INSIDE THE PRODUCT"}
          </span>
          <h2>
            {initial?.parent_pitch_id
              ? "Make the next attempt count."
              : kind === "pitch"
                ? "Tell us what you’re building."
                : "Put your idea under the microscope."}
          </h2>
          <p>
            {kind === "pitch"
              ? "Pitch naturally. The panel will find the questions worth asking."
              : "Get a transparent report. Change the assumptions. See what holds up."}
          </p>
        </div>
        <Badge tone="green">
          <LockKeyhole size={12} />
          Private by default
        </Badge>
      </div>
      <div className="example-row">
        <span>
          <FlaskConical size={14} /> Try a labelled example
        </span>
        {(Object.keys(EXAMPLES) as (keyof typeof EXAMPLES)[]).map((key) => (
          <button key={key} type="button" onClick={() => example(key)}>
            {key === "weak"
              ? "Weak pitch"
              : key === "decent"
                ? "Promising idea"
                : "Strong pitch"}
          </button>
        ))}
      </div>
      <label>
        Idea name{" "}
        <input
          value={form.title}
          maxLength={120}
          placeholder="Something worth remembering"
          onChange={(e) => change("title", e.target.value)}
        />
      </label>
      <label>
        Your {kind === "pitch" ? "opening pitch" : "idea"}
        <textarea
          required
          minLength={20}
          maxLength={6000}
          rows={7}
          value={form.idea}
          placeholder="What problem are you solving, for whom, and why does your approach work? Tell us what you've validated and what you're still figuring out."
          onChange={(e) => change("idea", e.target.value)}
        />
        <span className="field-note">
          {form.idea.length}/6,000 characters · Specific beats impressive.
        </span>
      </label>
      {kind === "pitch" && (
        <fieldset className="difficulty-picker">
          <legend>How hot is the room?</legend>
          {[
            {
              id: "friendly",
              title: "Friendly Angel",
              caption: "Supportive, still specific",
              symbol: "◌",
            },
            {
              id: "vc",
              title: "Real VC",
              caption: "Evidence over enthusiasm",
              symbol: "◉",
            },
            {
              id: "shark",
              title: "Shark Mode",
              caption: "Defend every assumption",
              symbol: "✦",
            },
          ].map((d) => (
            <label
              key={d.id}
              className={form.difficulty === d.id ? "active" : ""}
            >
              <input
                type="radio"
                name="difficulty"
                value={d.id}
                checked={form.difficulty === d.id}
                onChange={() => change("difficulty", d.id)}
              />
              <span className="difficulty-symbol">{d.symbol}</span>
              <strong>{d.title}</strong>
              <small>{d.caption}</small>
            </label>
          ))}
        </fieldset>
      )}
      <div className="form-grid">
        <label>
          Geography
          <input
            value={form.geography}
            maxLength={80}
            onChange={(e) => change("geography", e.target.value)}
          />
        </label>
        <label>
          Stage
          <select
            value={form.stage}
            onChange={(e) => change("stage", e.target.value)}
          >
            <option value="idea">Idea</option>
            <option value="prototype">Prototype</option>
            <option value="early_revenue">Early revenue</option>
            <option value="growth">Growth</option>
          </select>
        </label>
        <label>
          Currency
          <select
            value={form.currency}
            onChange={(e) => {
              change("currency", e.target.value);
              change("locale", e.target.value === "INR" ? "IN" : "intl");
            }}
          >
            <option value="USD">USD · K / M / B</option>
            <option value="INR">INR · lakh / crore</option>
          </select>
        </label>
      </div>
      <button
        type="button"
        className="text-button advanced-toggle"
        aria-expanded={advanced}
        onClick={() => setAdvanced(!advanced)}
      >
        {advanced ? "−" : "+"} Research, customer & model settings
      </button>
      {advanced && (
        <div className="advanced-form">
          <div className="form-grid">
            <label>
              Who pays?
              <input
                value={form.target_customer}
                maxLength={300}
                onChange={(e) => change("target_customer", e.target.value)}
                placeholder="A specific reachable segment"
              />
            </label>
            <label>
              Monthly price hypothesis
              <input
                type="number"
                min="0"
                max="10000000"
                value={form.price_guess ?? ""}
                onChange={(e) =>
                  change(
                    "price_guess",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              />
            </label>
            <label>
              Projection horizon
              <select
                value={form.horizon_months}
                onChange={(e) =>
                  change("horizon_months", Number(e.target.value))
                }
              >
                <option value={24}>24 months</option>
                <option value={36}>36 months</option>
                <option value={60}>60 months</option>
                <option value={120}>120 months</option>
              </select>
            </label>
          </div>
          <label>
            Industry
            <input
              value={form.industry}
              maxLength={100}
              onChange={(e) => change("industry", e.target.value)}
            />
          </label>
          <label>
            Approved generic search terms
            <input
              maxLength={180}
              value={form.research_terms}
              placeholder="e.g. independent clinic scheduling software"
              onChange={(e) => change("research_terms", e.target.value)}
            />
            <span className="field-note">
              Only these terms and your geography go to search. Leave out secret
              details.
            </span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.research_consent}
              onChange={(e) => change("research_consent", e.target.checked)}
            />
            Allow public market research using these generic terms.
          </label>
          <label>
            Known competitors (optional)
            <input
              maxLength={300}
              value={form.known_competitors}
              onChange={(e) => change("known_competitors", e.target.value)}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.named_search_consent}
              onChange={(e) => change("named_search_consent", e.target.checked)}
            />
            Also permit searches for these named competitors.
          </label>
        </div>
      )}
      {config?.mode === "live" ? (
        <div className="consent-box">
          <label className="checkbox">
            <input
              required
              type="checkbox"
              checked={form.cloud_consent}
              onChange={(e) => change("cloud_consent", e.target.checked)}
            />
            I consent to sending this idea and session to the configured model
            providers. I have checked their data terms and excluded secrets.
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.analytics_consent}
              onChange={(e) => change("analytics_consent", e.target.checked)}
            />
            Optionally share de-identified practice metrics with the BigQuery
            analytics dataset. No idea or transcript text.
          </label>
        </div>
      ) : (
        <div className="demo-note">
          <Badge tone="amber">DEMO MODE</Badge> Local rules and illustrative
          assumptions. No model or search requests are made. Enable live
          providers in Setup when you&apos;re ready.
        </div>
      )}
      {error && <ErrorBox error={error} />}
      <div className="form-submit">
        <span>
          <LockKeyhole size={14} />
          Saved to your private workspace.
        </span>
        <button
          className="button primary"
          type="submit"
          disabled={busy || form.idea.trim().length < 20}
        >
          {busy
            ? "Starting…"
            : kind === "pitch"
              ? "Take the floor"
              : "Build my analysis"}
          <ArrowRight size={17} />
        </button>
      </div>
    </form>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, LogIn, ShieldCheck } from "lucide-react";
import { api, download, getConfig, login, logout } from "@/lib/api";
import type { Config } from "@/lib/types";
import { Badge, ErrorBox, Loading } from "@/components/ui";

export default function Setup() {
  const [config, setConfig] = useState<Config>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);
  if (!config)
    return error ? (
      <ErrorBox error={error} />
    ) : (
      <Loading text="Checking service configuration" />
    );
  async function signIn() {
    try {
      await login(true);
      setNotice("Signed in with Google. Your private workspace is ready.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">NO GUESSWORK REQUIRED</span>
          <h1>
            Your guide to the grill<span className="mint-dot">.</span>
          </h1>
          <p>What does what. What needs a key. What works right now.</p>
        </div>
        <Badge tone={config.mode === "demo" ? "amber" : "green"}>
          {config.mode} mode
        </Badge>
      </div>
      {error && <ErrorBox error={error} retry={() => setError("")} />}
      {notice && (
        <div className="demo-note">
          <Badge tone="green">Saved</Badge>
          {notice}
        </div>
      )}
      <section className="card">
        <span className="eyebrow">THREE WAYS TO GET VALUE</span>
        <h2>Start where you need the most help.</h2>
        <div className="setup-step">
          <span>01</span>
          <div>
            <h3>Practice in the pitch room.</h3>
            <p>
              Describe the idea, choose a difficulty, and answer questions by
              typing or speaking. Follow-ups target your gaps. Finish for a
              scorecard, rewritten pitch and prep sheet.
            </p>
            <Link href="/pitch" className="text-link">
              Enter the room <ArrowRight size={14} />
            </Link>
          </div>
        </div>
        <div className="setup-step">
          <span>02</span>
          <div>
            <h3>Analyze the idea on its own.</h3>
            <p>
              Inspect market ranges, revenue, economics, competitors, wedges and
              risks. Every planning number has a provenance label. Change
              assumptions in “What if?”; previews use Python, with zero model
              calls.
            </p>
            <Link href="/analysis/new" className="text-link">
              Build an analysis <ArrowRight size={14} />
            </Link>
          </div>
        </div>
        <div className="setup-step">
          <span>03</span>
          <div>
            <h3>Return with better evidence.</h3>
            <p>
              Retry a completed pitch to compare six dimensions. Save model
              scenarios as new versions, compare pivots, print a report or share
              selected sections through an expiring read-only link.
            </p>
            <Link href="/dashboard" className="text-link">
              See your progress <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>
      <section className="card">
        <span className="eyebrow">DEMO TO LIVE, WHEN YOU&apos;RE READY</span>
        <h2>The shortest path to real reasoning.</h2>
        <div className="setup-step">
          <span>01</span>
          <div>
            <h3>Start locally.</h3>
            <p>
              The default demo needs no key, login account or cloud setup.
              Docker launches the frontend, API and durable analysis worker.
            </p>
            <code>docker compose up</code>
            <p style={{ marginTop: 10 }}>
              Open http://localhost:3000. Without Docker: run{" "}
              <code>python scripts/run.py</code>, or use{" "}
              <code>scripts/run.ps1</code> on Windows and{" "}
              <code>scripts/run.sh</code> on Linux/macOS.
            </p>
          </div>
        </div>
        <div className="setup-step">
          <span>02</span>
          <div>
            <h3>Configure Firebase and Gemini.</h3>
            <p>
              Create a Firebase project, enable Google and Anonymous sign-in,
              create Firestore, and register a web app. Put keys in the root
              .env; never put model keys in NEXT_PUBLIC variables. Use
              Application Default Credentials or a private mounted
              service-account file on the backend.
            </p>
            <pre>{`APP_MODE=live\nSTORAGE_BACKEND=firestore\nFIREBASE_PROJECT_ID=your-project\nGEMINI_API_KEY=your-private-key\nNEXT_PUBLIC_FIREBASE_API_KEY=your-web-config\nNEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com\nNEXT_PUBLIC_FIREBASE_APP_ID=your-web-app-id`}</pre>
            <p>
              Apply firestore.rules and use explicit ALLOWED_ORIGINS. Add your
              deployed frontend domain to Firebase authorized domains.
              Credential mounting and Cloud Run commands are in
              docs/google-cloud.md.
            </p>
          </div>
        </div>
        <div className="setup-step">
          <span>03</span>
          <div>
            <h3>Restart and check the live connections.</h3>
            <p>
              Configuration indicators below report whether settings are
              present; they do not claim that a credential has been live-tested.
              Run the provider probe to verify reasoning metadata and JSON
              output.
            </p>
            <code>python -m backend.llm.check</code>
            <p style={{ marginTop: 12 }}>
              Use the bake-off harness for the weak, developing and strong
              pitches: <code>python scripts/bakeoff.py --runs 10</code>. In live
              mode, submissions require explicit provider consent; search uses
              only your approved generic terms.
            </p>
          </div>
        </div>
      </section>
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            GOOGLE SERVICES, WITH A REASON TO BE HERE
          </span>
          <h2>The service map.</h2>
        </div>
        <Badge>
          {config.services.filter((s) => s.configured).length} configured /{" "}
          {config.services.length}
        </Badge>
      </div>
      <div className="setup-grid">
        {config.services.map((service) => (
          <section className="service-card" key={service.name}>
            <Badge
              tone={
                service.active
                  ? "green"
                  : service.configured
                    ? "amber"
                    : "neutral"
              }
            >
              {service.active
                ? "Configured for live use"
                : service.configured
                  ? "Configured · inactive in demo"
                  : "Optional · not configured"}
            </Badge>
            <h3>{service.name}</h3>
            <p>{service.purpose}</p>
            <span className="eyebrow">WHAT IT NEEDS</span>
            <code>{service.needs}</code>
            <a href={service.url} target="_blank" rel="noreferrer">
              Official console / docs <ExternalLink size={12} />
            </a>
          </section>
        ))}
      </div>
      <section className="card" style={{ marginTop: 25 }}>
        <h2>Provider fallback chain</h2>
        <p>
          Gemini is prioritized. Rate limits trigger cooldowns, invalid JSON
          gets one repair, and failures fall through to the next configured
          provider. Fast fallback is visibly degraded. Demo rules never pretend
          to be a reasoning model.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Model</th>
                <th>Configuration</th>
              </tr>
            </thead>
            <tbody>
              {config.providers.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td>{p.model || "Choose a current model"}</td>
                  <td>
                    <Badge tone={p.configured ? "green" : "neutral"}>
                      {p.configured ? "Key present" : "No key"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <ShieldCheck size={23} />
        <h2>Private by default. Honest by design.</h2>
        <p>{config.privacy}</p>
        <p>
          Retention: {config.retention_days} days. Demo guest history is tied to
          this browser&apos;s signed token; clearing storage loses access.
          Shared links can expose selected details, so review the section list
          before sharing. Browser speech recognition may send audio to your
          browser vendor; typing remains available. Google cloud speech requires
          explicit use and configured credentials.
        </p>
        <div className="setup-auth">
          {config.mode === "live" && (
            <button className="button secondary" onClick={signIn}>
              <LogIn size={15} />
              Sign in with Google
            </button>
          )}
          <button
            className="button ghost"
            onClick={() =>
              download("/api/user/export", "pitchgrill-workspace.json").catch(
                (e) => setError(e.message),
              )
            }
          >
            Export your data
          </button>
          <button
            className="button ghost"
            onClick={() =>
              logout()
                .then(() => {
                  setNotice(
                    "Signed out. Live anonymous users should link Google sign-in before signing out to retain history.",
                  );
                })
                .catch((e) => setError(e.message))
            }
          >
            Sign out
          </button>
          <button
            className="button danger"
            onClick={() => {
              if (
                window.confirm(
                  "Delete your entire workspace, reports and shares? This cannot be undone.",
                )
              )
                api("/api/user", { method: "DELETE" })
                  .then(logout)
                  .then(() => {
                    window.location.href = "/";
                  })
                  .catch((e) => setError(e.message));
            }}
          >
            Delete all workspace data
          </button>
        </div>
      </section>
    </>
  );
}

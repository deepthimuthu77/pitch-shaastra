# PitchGrill — Project Overview

## 1. What this project is

PitchGrill is a full-stack startup-practice product. It puts a founder in a simulated investor room, asks difficult questions about the founder's idea, records how the founder responds, and produces concrete coaching for the next attempt.

The project has two closely related experiences:

1. **Pitch room:** a Shark Tank-style conversation with four fictional investors.
2. **Idea analysis:** a structured, evidence-aware workspace for researching the market, competitors, business model, revenue, unit economics, risks, and strategic wedge of an idea.

The product goal is practice and clarity, not real investment advice. Offers, investor reactions, scores, and readiness indicators are simulations and coaching judgments.

The repository currently supports a credential-free offline/demo mode and a credentialed live mode using Google/Firebase services and configurable LLM providers.

## 2. Product intent

The pitch experience is designed to simulate pressure and expose weak reasoning rather than merely generate an encouraging chatbot response.

The four panelists have different evaluation lenses:

| ID | Persona | Main lens |
| --- | --- | --- |
| `vc` | Skeptical VC | Market size, timing, defensibility, and why this founder |
| `operator` | Operator | Unit economics, acquisition, execution, and hiring |
| `customer` | Customer advocate | Pain, buyer, use case, and evidence of demand |
| `impact` | Impact/ethics investor | Risk, regulation, privacy, misuse, and long-term effects |

Each investor has an independent interest score. Investors can disagree with one another, challenge a previous point, request evidence, and produce an individual verdict.

The system also tries to detect common pitch weaknesses:

- dodging the question;
- vague claims such as “huge market” or “everyone needs this”;
- missing numbers when numbers were requested;
- implausible or unsupported numeric claims;
- strong, evidence-backed answers.

The intended founder outcome is a better next pitch: a scorecard, quoted weaknesses, a rewritten short pitch, a preparation sheet, targeted practice, and comparison with earlier attempts.

## 3. Major user journeys

### 3.1 First-time setup

The frontend starts on the setup/guide flow. It explains the available services and whether the application is running in demo or live mode. Configuration indicators describe presence of configuration; they do not prove that credentials work.

### 3.2 Pitch session

1. The founder enters an idea and optional operating details such as stage, target customer, business model, funding ask, and equity offered.
2. The backend creates a pitch record with four investor states initialized to 55/100.
3. The opening pitch is assessed and each investor reacts.
4. The founder answers up to eight questions. Questions are adaptive and can focus on the weakest category.
5. Each answer is stored with flags, metrics, investor reactions, interest changes, and the next question.
6. The founder finishes the session and receives a report.
7. The founder can review flags, practice a weak category, negotiate simulated offers, or retry from the previous session.

The backend uses a request ID for answer submissions and a per-pitch lock. This makes answer submission idempotent and prevents concurrent writes to the same session.

### 3.3 Finish and coaching

The final report contains:

- six scores: team, market, traction, business model, defensibility, and clarity;
- exactly three prioritized weaknesses with transcript evidence and an action;
- one verdict per investor: in, out, or conditional;
- a rewritten pitch;
- five difficult preparation questions with suggested answers;
- readiness and improvement-plan information;
- investor trajectories and, when available, simulated offers.

Before the final verdict, the system attempts a claim check using the analysis workspace. This is meant to distinguish a supported or qualified founder claim from an unsupported assertion.

### 3.4 Negotiation

The report may contain fictional investor offers. The founder can accept, counter, or walk away. Rule-based code owns the actual deal terms and enforces valid amounts, equity ranges, counteroffer limits, and the rule that only one offer can be accepted. Optional model-generated investor dialogue is only commentary around those rules; it cannot alter the terms.

### 3.5 Idea analysis

The founder may create a standalone analysis or an analysis attached to a pitch. The durable analysis pipeline has seven stages:

1. `intake` — normalize the idea and identify the problem, solution, segment, industry, stage, and generic research terms.
2. `research` — optionally obtain market and competitor evidence using approved search terms.
3. `extract` — turn research material into structured facts and source-linked excerpts.
4. `assumptions` — build an editable low/base/high assumption set.
5. `model` — calculate market, revenue, unit economics, runway, simulation, and sensitivity outputs.
6. `synthesis` — produce competitor, wedge, moat, regulatory, and risk conclusions.
7. `assemble` — calculate confidence, signals, warnings, and the final report.

Each stage records status and elapsed time. Sections are saved independently so a failure does not erase completed work. Jobs are durable and leased, allowing a local worker or a cloud task to resume work without duplicate concurrent execution.

### 3.6 Versions, sharing, and export

Analysis changes are versioned. Recomputing assumptions is designed to be a pure calculation when possible and does not overwrite the original version. Research refreshes create a new version. Users can compare versions, run claim checks, export JSON/CSV, archive a private copy, and create expiring selective shares.

Public shares expose only selected safe sections. The private idea text and owner identity are not included in the public response. Shares use high-entropy tokens while only token hashes are stored.

### 3.7 Cohorts and analytics

Users can create or join cohorts and opt into aggregate comparison. Benchmark data is deliberately suppressed until there are at least five consenting real participants and ten real sessions. Demo/synthetic sessions are excluded. Cohort results contain aggregates only, not another participant’s pitch or report.

## 4. System architecture

```text
Browser (Next.js / TypeScript)
        |
        | bearer identity and JSON/streaming requests
        v
FastAPI API (Python)
   |             |
   |             +--> Structured LLM gateway
   |                    Gemini / Groq / OpenRouter / Mistral / Cerebras
   |
   +--> SQLite locally or Firestore in live cloud mode
   |
   +--> Optional Google Speech, Text-to-Speech, Storage, BigQuery, Logging
   |
   +--> Durable analysis job queue
              |
              +--> local backend.worker
              +--> Cloud Tasks -> /api/internal/job
```

### Frontend

The frontend is a Next.js App Router application in `frontend/`. It is written in TypeScript and uses client-side components for interactive pitch, dashboard, analysis, audio, charts, and deal-room behavior. The browser API URL is supplied at build time through `NEXT_PUBLIC_API_URL`; the server-side Next.js process can use `API_INTERNAL_URL` to reach the API container.

### API

The FastAPI application is assembled in `backend/main.py`. It owns validation, authentication dependencies, tenant checks, endpoint orchestration, locks, response formatting, and integration boundaries. Domain behavior is split into modules rather than put entirely in the route file.

### Persistence

The storage abstraction in `backend/store.py` supports:

- SQLite with local files, WAL mode, transactions, leases, and lock records;
- Firestore for shared cloud persistence.

Records are scoped by owner, collection/kind, and opaque ID. Analyses store large sections separately to avoid Firestore document-size problems. A deletion tombstone prevents an in-flight job from recreating a deleted user’s records.

### Background work

`backend/worker.py` polls the durable job queue locally, heartbeats the worker, runs analysis jobs, marks job completion, and periodically purges retained data. In live cloud deployments, Cloud Tasks can dispatch the same job to the authenticated internal endpoint. The worker and Cloud Tasks path use the same durable job/lease model.

## 5. Backend module map

| Path | Responsibility |
| --- | --- |
| `backend/main.py` | FastAPI app, middleware, route handlers, orchestration, exports/sharing, voice endpoints |
| `backend/config.py` | Environment-backed settings and runtime validation |
| `backend/security.py` | Demo tokens, Firebase verification, user dependency, rate limiting, safe IDs, redaction |
| `backend/middleware.py` | Stream-aware request body limit |
| `backend/store.py` | SQLite/Firestore storage, locks, durable jobs, retention, deletion tombstones |
| `backend/pitch.py` | Investor questions, demo rules, LLM-backed pitch reactions, final pitch report |
| `backend/coaching.py` | Answer metrics, weakness tracking, readiness, flag review, practice selection, report enrichment |
| `backend/deals.py` | Deterministic offer generation and negotiation constraints |
| `backend/negotiation.py` | Optional investor reaction to deal actions, with schema validation and safe fallback |
| `backend/cohorts.py` | Cohort membership, invites, consent, aggregate metrics, benchmark suppression |
| `backend/analysis/service.py` | Seven-stage analysis workflow, durable progress, section persistence, claim checks |
| `backend/analysis/models.py` | Market/revenue/unit-economics calculations, Monte Carlo, sensitivity, numeric grounding |
| `backend/analysis/research.py` | Search adapter, URL safety, source assignment, citation/excerpt handling |
| `backend/analysis/insights.py` | Market growth, competitor feature matrix, beachhead, wedge stability |
| `backend/analysis/schemas.py` | Strict structured models for assumptions, facts, competitors, strategy, risks, and claims |
| `backend/llm/client.py` | Async provider calls, timeouts, cooldowns, fallback tiers, JSON repair, usage metadata |
| `backend/llm/providers.py` | Provider URLs, chains, models, and reasoning parameter compatibility |
| `backend/llm/parse.py` | Removes reasoning blocks and extracts JSON safely |
| `backend/google_services.py` | Secret loading, Cloud Tasks, Storage, BigQuery, speech, text-to-speech, logging |
| `backend/worker.py` | Local durable analysis worker |
| `backend/maintenance.py` | Retention/purge command |

## 6. API surface

### Core and identity

- `GET /health` — service, mode, storage, and worker readiness.
- `GET /api/config` — frontend setup metadata and configured-service indicators.
- `POST /api/auth/guest` — demo-only guest token creation.

Live mode uses Firebase identity instead of the demo token. Anonymous Firebase users can later link a Google identity in the frontend flow.

### Pitch

- `POST /api/pitch/start`
- `POST /api/pitch/answer`
- `POST /api/pitch/finish`
- `POST /api/pitch/prep`
- `POST /api/pitch/flag-review`
- `POST /api/pitch/interject`
- `POST /api/pitch/practice`
- `POST /api/pitch/deal`
- `GET /api/pitches`
- `GET /api/pitches/{id}`
- `DELETE /api/pitches/{id}`

### Analysis

- `POST /api/analysis`
- `GET /api/analysis`
- `GET /api/analysis/{id}`
- `GET /api/analysis/{id}/stream` — progress/event stream.
- `POST /api/analysis/{id}/recompute`
- `POST /api/analysis/{id}/version`
- `POST /api/analysis/{id}/rerun`
- `POST /api/analysis/compare`
- `POST /api/analysis/{id}/claim-check`
- `GET /api/analysis/{id}/export?format=json|csv`
- `POST /api/analysis/{id}/archive`
- `POST /api/analysis/{id}/share`
- `GET /api/analysis/{id}/shares`
- `DELETE /api/analysis/share/{key}`
- `GET /api/public/analysis/{token}`
- `DELETE /api/analysis/{id}`

### Analytics, privacy, jobs, and speech

- `GET /api/analytics/overview`
- `POST /api/demo/seed`
- `GET /api/user/export`
- `DELETE /api/user`
- `POST /api/internal/job` — Cloud Tasks-only internal dispatch.
- `POST /api/voice/speak`
- `POST /api/voice/transcribe`

Cohort routes are defined in `backend/cohorts.py` and cover cohort creation, listing, invitations, joining, consent, overview, and leaving.

## 7. Analysis and financial model

The analysis workspace deliberately separates evidence, assumptions, calculations, and subjective strategy judgments.

### Evidence model

Research terms leaving the server must be founder-approved generic terms. The server does not crawl arbitrary founder-supplied URLs. Sources are assigned IDs in code, deduplicated, HTTPS-filtered, and linked to literal excerpts. Numeric evidence is checked against the quoted excerpt, with unit, geography, and recency checks for sourced assumptions.

The result is traceability, not proof of truth. Search snippets may be incomplete and the model may still misunderstand them. The UI exposes sources and raw exports so the reviewer can inspect the basis.

### Assumptions

The system supports up to 21 editable assumptions with low/base/high ranges. Business-model-specific equations exist for:

- subscription;
- marketplace;
- one-time sales;
- hardware;
- services.

Initial cash is optional. When it is unknown, runway is shown as unavailable rather than fabricated.

### Calculations

The pure Python model includes:

- top-down market estimates and bottom-up reachable-market estimates;
- revenue scenarios over a configurable horizon;
- customer acquisition, churn, price, expansion, gross margin, CAC, and fixed-cost effects;
- target-account ceilings;
- unit economics and payback/ratio availability checks;
- runway and peak cumulative cash deficit;
- 1,000 seeded triangular Monte Carlo samples by default;
- p10/p50/p90 fan-chart values;
- one-variable-at-a-time sensitivity;
- wedge scoring and ranking stability.

The financial output is a model of the selected assumptions, not a calibrated probability of business success. Taxes, working capital, financing, discounting, and foreign-exchange conversion are not inferred. INR values are an illustrative scale unless the founder supplies a relevant source.

## 8. LLM and provider behavior

All conversational and structured model calls go through `backend/llm/client.py`. The gateway:

- supports configurable provider chains;
- tries a reason tier and may degrade to a fast tier;
- observes per-call and total deadlines;
- cools down providers after rate limits;
- validates responses against strict Pydantic schemas;
- retries once with a correction prompt after invalid JSON;
- strips unsupported reasoning/response-format parameters after a provider rejection;
- preserves provider, model, latency, tier, fallback, token, and degradation metadata when available.

Configured provider families include Gemini, Groq, OpenRouter, Mistral, and Cerebras. Provider/model chains and keys are environment-controlled. Demo mode raises a deliberate `LLMUnavailable` before any external request, so offline mode is deterministic and credential-free.

The schema layer requires exactly four investor reactions and exactly four final verdicts. This prevents a model response from silently omitting or duplicating a panelist.

## 9. Frontend map

| Path | User-facing purpose |
| --- | --- |
| `frontend/app/page.tsx` | Landing/entry page |
| `frontend/app/setup/page.tsx` | Guide, setup, and service configuration indicators |
| `frontend/app/pitch/page.tsx` | Start a pitch and choose inputs |
| `frontend/app/pitch/[id]/page.tsx` | Active investor room |
| `frontend/app/pitch/[id]/report/page.tsx` | Final pitch report and coaching |
| `frontend/app/pitch/[id]/deal/page.tsx` | Simulated deal room |
| `frontend/app/dashboard/page.tsx` | History, trends, and analytics overview |
| `frontend/app/cohorts/page.tsx` | Cohort management and comparisons |
| `frontend/app/analysis/page.tsx` | Analysis history |
| `frontend/app/analysis/new/page.tsx` | Analysis intake |
| `frontend/app/analysis/[id]/page.tsx` | Analysis report and progress |
| `frontend/app/analysis/[id]/compare/page.tsx` | Version comparison |
| `frontend/app/r/[token]/page.tsx` | Public shared analysis view |
| `frontend/app/r/[token]/opengraph-image.tsx` | Social preview for a shared report |

Important components include the app shell, intake form, analysis report, coaching, deal room, cohort comparison, market-depth visualizations, investor atmosphere, charts, voice controls, and spoken-practice controls.

The frontend supports typed input plus browser speech recognition and synthesis. Optional Google Speech-to-Text and Text-to-Speech endpoints provide an alternate path. Ambient sound is generated/controlled in the browser and is opt-in.

## 10. Security, privacy, and trust boundaries

The code treats founder ideas and transcripts as private user data.

- Demo tokens are HMAC-protected and browser-scoped; live users are verified through Firebase with revocation-aware checks.
- Every owner-scoped read/write uses the authenticated user ID.
- IDs are validated before they are used in storage paths.
- CORS allows explicit configured origins only; wildcard origins are rejected.
- Request bodies are limited both through `Content-Length` and streamed body inspection.
- Per-IP and per-user rate limits protect expensive operations.
- Responses add `nosniff`, frame-deny, no-store, and referrer-policy headers.
- Model text is rendered as text; search suggestions are isolated in a sandboxed frame.
- Public share tokens are hashed at rest, expire, and can be revoked.
- CSV export neutralizes spreadsheet formula injection.
- Live external calls require explicit cloud consent for the idea.
- Search receives only approved generic terms, geography, and optionally named competitors.
- Analytics export is opt-in and stores an opaque session hash plus aggregate score metadata, not transcripts or idea text.
- User export and deletion endpoints exist; cloud archive/telemetry deletion is attempted before local deletion.
- Demo and synthetic sessions are excluded from real benchmarks.

This is an application-level security design, not a guarantee that every deployment is production-ready. Rate limiting is process-local, so a high-traffic deployment would need distributed quota enforcement and load testing. Cloud credentials and IAM policies still require deployment-specific verification.

## 11. Runtime modes

### Demo mode

Defaults are `APP_MODE=demo` and SQLite. Demo mode:

- needs no account, API key, cloud project, or database installation;
- uses local rules and deterministic illustrative assumptions;
- never calls an external LLM or search provider;
- uses synthetic/demo identity and data;
- is intended for local evaluation and UI demonstration.

### Live mode

Live mode requires Firebase project configuration and consent before sending an idea to configured providers. Firestore is the intended shared storage backend. Optional adapters add Google Search grounding, Secret Manager, Cloud Tasks, Speech, Text-to-Speech, Cloud Storage, BigQuery, and Cloud Logging.

The setup guides in `docs/google-cloud.md` and `docs/groq-setup.md` describe the credential and IAM requirements. Environment secrets must remain outside the repository and must never be placed in `NEXT_PUBLIC_*` values.

## 12. Running the project

### Docker Compose

The main path is:

```sh
docker compose up --build
```

The frontend is normally available at `http://localhost:3000` and the API at `http://localhost:8000`. Compose runs three services: `frontend`, `api`, and the durable `worker`. API and frontend containers use read-only roots, a temporary filesystem, dropped capabilities, no-new-privileges, memory limits, and loopback-bound host ports.

The named volume preserves local demo history. `docker compose down -v` removes that volume and its data.

For Google-backed local operation, use the compose override described in `docs/google-cloud.md` or `docs/groq-setup.md`, mounting credentials read-only.

### Native launcher

Supported native runtime:

- Python 3.11–3.13;
- Node.js 22 or newer;
- Windows PowerShell: `./scripts/run.ps1`;
- Linux/macOS: `sh scripts/run.sh`;
- portable Python launcher: `python scripts/run.py`.

The launcher creates `.venv`, installs locked backend and frontend dependencies, starts API/worker/frontend, waits for health, and optionally opens the browser. `--production` builds Next.js before starting it; `--skip-install` assumes dependencies already exist.

## 13. Testing and validation

Backend tests live in `tests/` and use isolated temporary storage plus mocked providers. They cover:

- pitch flow and tenant isolation;
- analysis completion, versions, sharing, export, and deletion;
- negotiation bounds and single acceptance;
- idempotent interjections and answers;
- LLM fallback, cooldown, JSON repair, and reasoning-parameter compatibility;
- model math, finite values, bounds, directionality, Monte Carlo reproducibility, and numeric grounding;
- source URL safety and code-assigned citations;
- request-size limits, CORS, deletion tombstones, and job leases;
- claim checks, false-positive protection, flag review ownership, and cohort suppression.

Frontend tests include TypeScript/lint checks and Playwright flows under `frontend/e2e/`. The browser tests target an already running demo application and use synthetic sessions.

Useful checks from the repository README are:

```sh
python -m pytest
python -m ruff check backend tests scripts
python -m backend.llm.check
python scripts/bakeoff.py --runs 10
```

Inside `frontend/`:

```sh
npm ci
npm run lint
npm run typecheck
npm audit --audit-level=moderate
npx playwright install chromium
npm run test:e2e
```

The repository’s validation record distinguishes offline/demo checks from live acceptance. Provider credentials, Firebase/Firestore, real search grounding, Cloud Tasks OIDC, Google voices, private cloud export/deletion, and microphone quality require separate credentialed/device testing.

## 14. Deployment model

`deploy/cloudbuild.yaml` builds separate backend and frontend images for Artifact Registry. The documented cloud target is Cloud Run:

- API service on port 8000;
- frontend service on port 3000;
- Firestore for shared persistence;
- Cloud Tasks for durable analysis dispatch;
- a maintenance job for retention cleanup.

The frontend’s public API URL is a build argument, so changing the API hostname requires a frontend rebuild. `PUBLIC_APP_URL` and `ALLOWED_ORIGINS` must match the deployed hostnames. The production recipe explicitly warns against deploying demo mode publicly and against using ephemeral local disk for live data.

## 15. Repository guide

```text
backend/        FastAPI service and domain logic
frontend/       Next.js application and browser tests
tests/          Python unit/integration tests
docs/           Architecture, design, setup, demo, validation, and deployment notes
data/           Local SQLite/runtime data location
deploy/         Cloud Build, Cloud Run environment example, BigQuery starter schema
scripts/        Cross-platform launchers and model bake-off
prompts/        Narrow operational prompt used for commit ownership decisions
compose*.yaml   Local container orchestration
firebase.json   Firebase CLI project settings
firestore.*     Firestore rules and index configuration
```

`AGENTS.md` and `review-ownership.json` are repository-process files. They describe commit ownership and are not part of the product runtime.

## 16. Current limitations and important interpretations

1. **The project is a simulator.** Investor decisions and offers are fictional and are not investment intent, valuation, or financial advice.
2. **Evidence linkage is not truth verification.** A cited excerpt is required, but source quality and model interpretation still need human review.
3. **Demo behavior is intentionally non-live.** A successful demo does not prove that a configured provider, Firebase project, Cloud Task, speech service, or Firestore deployment works.
4. **Readiness scores are practice metrics.** They should not be interpreted as a probability of fundraising success.
5. **Financial assumptions are simplified.** The model intentionally omits several real-world finance effects and makes no implicit currency conversion.
6. **Process-local limits do not scale automatically.** Production traffic needs distributed controls and operational load testing.
7. **The repository may contain work in progress.** The overview describes the current working tree’s implemented intent; it should be revisited when major backend/frontend flows change.

## 17. Where an outsider should start

For a product understanding, read `README.md`, then `docs/demo.md` and this document.

For system behavior, start with `backend/main.py`, `backend/pitch.py`, `backend/analysis/service.py`, `backend/analysis/models.py`, and `backend/store.py`.

For the user interface, start with `frontend/app/pitch/[id]/page.tsx`, `frontend/app/pitch/[id]/report/page.tsx`, `frontend/app/analysis/[id]/page.tsx`, `frontend/lib/api.ts`, and `frontend/lib/types.ts`.

For operational setup, read `docs/google-cloud.md`, `docs/groq-setup.md`, `docs/validation.md`, `compose.yaml`, and `scripts/run.py`.

For security reasoning, read `docs/architecture.md`, `backend/security.py`, `backend/middleware.py`, `backend/analysis/research.py`, `firestore.rules`, and the hardening tests.

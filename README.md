# PitchGrill

For the selected Vercel + Render deployment, follow [free hosting](docs/free-hosting.md).

For Groq-powered investor dialogue with Firebase, Google Search and cloud voices,
follow [the credential checklist](docs/groq-setup.md). The investor room includes
opt-in ambient sound, visible investor convictions and spoken verdicts.

A Shark Tank simulator: enter with an investment ask, defend your idea against four fictional investors, hear their verdicts, and accept, counter or walk away from simulated offers. Private coaching afterward helps you prepare for another encounter. A separate idea-analysis workspace makes market assumptions, financial projections, competitive hypotheses and risks inspectable.

## Run the demo

```sh
docker compose up
```

Open **http://localhost:3000**. No `.env`, account, API key or cloud project is required. Compose builds the Next.js frontend, FastAPI API and durable analysis worker. First startup downloads dependencies; wait for healthy services. Docker Desktop must use Linux containers; Docker Compose 2.24+ is required for optional environment files. Ports 3000 and 8000 must be free.

The **Guide & setup** screen explains every flow, integration and configuration indicator. Start with a labelled example in **Pitch room** or **Idea analysis**. Demo mode uses local rules and explicit illustrative assumptions; it never calls a model or search provider and never presents invented research as evidence. Google fonts are optional; system fonts work offline after the images are built.

```sh
docker compose ps
docker compose logs --tail 100 api worker frontend
docker compose down
```

The named volume preserves demo history. `docker compose down -v` removes that volume and all demo data. After source changes, run `docker compose up --build`. To change ports, set `FRONTEND_PORT`, `API_PORT`, `NEXT_PUBLIC_API_URL`, `PUBLIC_APP_URL` and `ALLOWED_ORIGINS` together in `.env`.

## Run without Docker

Install standard Python **3.11–3.13** and Node.js **22+** (current LTS recommended; Node 24.12+ avoids Firebase engine warnings). The launchers install locked dependencies into the project and start all three processes. No database installation is needed for SQLite mode.

| Platform | Command from the repository root |
|---|---|
| Windows PowerShell | `./scripts/run.ps1` |
| Linux / macOS | `sh scripts/run.sh` |
| Any supported platform | `python scripts/run.py` |

Use `python3` on Unix if `python` is unavailable. Windows launcher chooses an installed supported Python version. Press **Ctrl+C** to stop the complete process tree.

```sh
python scripts/run.py --production
python scripts/run.py --skip-install --no-browser --api-port 8001 --frontend-port 3001
```

Production mode builds Next.js before starting. `--skip-install` is only for an already installed environment. Native history is in `data/`; browser guest tokens remain private to each browser. Python 3.14/free-threaded interpreters are outside the supported native runtime.

## What's included

- Four investor personas, three difficulties, adaptive follow-ups, disagreements, bounded interest changes, answer idempotency, timer and saved drafts.
- Typed answers, browser speech recognition and synthesis; optional Google Cloud transcription and distinct investor voices with explicit controls.
- Investor-led questioning, opt-in mid-answer interjections, fictional offers, bounded counteroffers, withdrawal and walk-away outcomes. The negotiation room precedes the coaching report.
- Evidence-anchored six-dimension scorecards, quoted weaknesses, auditable flag challenges, highlighted pitch rewrites, targeted practice, retry comparison and PDF printing. Claim checks run before the verdict; independently supported contradictions are distinguished from assumption-range comparisons.
- Standalone analysis with seven measured stages and durable leased jobs. Live research uses approved generic terms, code-assigned citations and literal evidence quotes.
- Twenty-one editable low/base/high assumptions. Subscription, marketplace, one-time sales, hardware and service models expose their different equations. Starting cash enables runway; unknown cash keeps runway unavailable.
- Revenue scenarios, unit economics, 1,000 seeded triangular simulations, percentile fan charts, sensitivity, sourced market growth/structure, evidence-backed competitor matrices, wedge beachhead estimates and ranking stability checks.
- Zero-model-call scenario previews, immutable saved versions, comparison, claim checks, selective expiring/revocable shares, JSON/CSV and all-section PDF printing.
- Private history, investor trajectories, retry chains, transparent practice readiness and opt-in cohort comparisons suppressed until there are five real participants and ten real sessions. Synthetic examples never contribute to real benchmarks.
- Export/delete controls, tenant isolation, Firebase token validation, streaming body limits, quotas, finite numeric validation, nonce CSP, restricted CORS and non-root read-only containers.

## Enable Google services

Copy `.env.example` to `.env` and follow [the Google setup guide](docs/google-cloud.md). Gemini + Firebase Auth are the first live prerequisites; Firestore is the shared cloud database. Relevant optional adapters cover Search grounding, Speech-to-Text, Text-to-Speech, Secret Manager, private Cloud Storage exports, consented BigQuery metrics, Cloud Tasks and Cloud Logging. Cloud Run and Artifact Registry host the same containers.

Live mode requires explicit founder consent before sending an idea to configured model providers. Research receives only approved search terms, geography and optionally named competitors. Browser speech may use the browser vendor's servers. The setup indicators show configuration presence, **not successful credential verification**.

No live credentials were supplied during development. External integrations require the probes and acceptance checks in [validation](docs/validation.md); offline demo success does not qualify a live model.

## Development and checks

```sh
python -m pip install -r backend/requirements.lock -r backend/requirements-dev.txt
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

Browser tests target an already running demo at `http://localhost:3000`; set `E2E_URL` for another frontend. They create only synthetic demo sessions. Screenshots and traces go to ignored `frontend/test-results/`. Backend tests use isolated temporary databases and mock provider responses.

See [architecture](docs/architecture.md), [demo walkthrough](docs/demo.md), [validation](docs/validation.md) and [review ownership](docs/commit-ownership.md). The supplied product brief is retained as [design input](docs/design.md); repository working rules live in `AGENTS.md`.

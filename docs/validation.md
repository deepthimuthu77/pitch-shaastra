# Validation record

## Hosting configuration check — October 8, 2026

The isolated `compose.hosted-check.yaml` production build passed with a
same-origin Next.js API proxy and an inline durable worker. All 61 backend tests,
Python lint, frontend type checking and five browser regression tests passed.
The backend image contains no credential-named files; idle memory was about
51 MB. This is a local demo-mode hosting compatibility check, not proof of a
deployed cloud service or a completed live-key workflow. See
[free hosting](free-hosting.md) for deployment status and limitations.

Development host: Windows, 8 October 2026. Offline/demo checks are distinct from credentialed live acceptance.

| Check | Result / evidence |
|---|---|
| Docker production build | Both images build; API, frontend and worker report healthy |
| Backend tests | 50 passing tests, including exhausted job recovery, negotiation, interjection idempotency, model selection, claim-check-before-verdict, review isolation and cohort consent |
| Python lint | Ruff passes |
| Frontend type checking | TypeScript passes; production Next.js build checks types too |
| Dependencies | npm audit: zero vulnerabilities; pip-audit of complete pinned lock: no known vulnerabilities |
| Docker browser flows | 5 Playwright tests pass: verdict → counteroffer → simulated deal → coaching → analysis/scenario/share/export/dashboard, disputed flags and targeted practice, mocked continuous speech, hardware model/starting cash, and mobile standalone analysis |
| Native Windows | Launcher starts API/worker/frontend on ports 8001/3001; the same two browser flows pass |
| Layout | Desktop and 390px mobile screenshots inspected; no mobile document overflow |
| Linux runtime | Production API/worker and Next.js run in Docker Linux containers |
| macOS native | Portable launcher implemented; no macOS hardware verification performed |
| Live model/search | Real Groq investor replies verified locally, including quota fallback; Google Search grounding rejected by the account's free quota. Complete live pitch-to-report acceptance remains pending |
| Firebase/Firestore/Google cloud | Real Firebase anonymous authentication and Firestore persistence verified locally; Google sign-in and optional cloud services remain pending |
| Microphone hardware | Browser/Google controls implemented; permission fallback exists; actual microphone and voice quality require a device check |

Run backend tests with `python -m pytest` and browser tests with `npm run test:e2e` inside `frontend`. The latter expect an already running app; set `E2E_URL` for the native instance. Reports and screenshots are ignored build artifacts, not committed synthetic history.

Tests cover tenant isolation, authentication, idempotent answers, immutable scenario versions, selective sharing/revocation, deletion tombstones, bounded inputs, chunked upload limits, unsafe source URL rejection, code-assigned citations, job leases, model finite values, scenario direction, reproducible uncertainty bands, number-unit grounding, false-positive negation, honest unknowns, cohort suppression and schema-repair/provider cooldowns.

Remaining live acceptance follows `docs/google-cloud.md`: verify provider reasoning support using the repeated bake-off, actual search grounding, Firebase account linking and cross-user isolation on Firestore, Cloud Tasks OIDC dispatch, four Google voices, private storage exports/deletion and consented BigQuery telemetry. Live credentials must stay outside Git. A configured indicator is not a successful API probe.

Core expansion checks: the offline bake-off catches planted vague claims and dodges, accepts quoted/negated claims and honest unknowns without false accusations, and preserves valid structured responses. Its local lookup times and rule output do not qualify a live model. Continuous speech tests use mocked browser recognition and synthesis; microphone hardware quality remains unverified. Negotiation uses explicit fictional rules, not real investment intent or calibrated valuation. New changes remain uncommitted while decision-agent use is disabled; ownership scopes are unchanged.

# Validation record

Development host: Windows, 8 October 2026. Offline/demo checks are distinct from credentialed live acceptance.

| Check | Result / evidence |
|---|---|
| Docker production build | Both images build; API, frontend and worker report healthy |
| Backend tests | 35 passing tests, including exhausted job recovery |
| Python lint | Ruff passes |
| Frontend type checking | TypeScript passes; production Next.js build checks types too |
| Dependencies | npm audit: zero vulnerabilities; pip-audit of complete pinned lock: no known vulnerabilities |
| Docker browser flows | 2 Playwright tests pass: pitch → answers → scorecard → analysis → scenario version → selective share/revoke → download → dashboard/setup, and mobile standalone analysis |
| Native Windows | Launcher starts API/worker/frontend on ports 8001/3001; the same two browser flows pass |
| Layout | Desktop and 390px mobile screenshots inspected; no mobile document overflow |
| Linux runtime | Production API/worker and Next.js run in Docker Linux containers |
| macOS native | Portable launcher implemented; no macOS hardware verification performed |
| Live model/search | Not verified: no real provider credentials supplied; fallback/schema behavior tested with HTTP mocks |
| Firebase/Firestore/Google cloud | Adapters and manual setup supplied; real-project acceptance pending credentials |
| Microphone hardware | Browser/Google controls implemented; permission fallback exists; actual microphone and voice quality require a device check |

Run backend tests with `python -m pytest` and browser tests with `npm run test:e2e` inside `frontend`. The latter expect an already running app; set `E2E_URL` for the native instance. Reports and screenshots are ignored build artifacts, not committed synthetic history.

Tests cover tenant isolation, authentication, idempotent answers, immutable scenario versions, selective sharing/revocation, deletion tombstones, bounded inputs, chunked upload limits, unsafe source URL rejection, code-assigned citations, job leases, model finite values, scenario direction, reproducible uncertainty bands, number-unit grounding, false-positive negation, honest unknowns, cohort suppression and schema-repair/provider cooldowns.

Remaining live acceptance follows `docs/google-cloud.md`: verify provider reasoning support using the repeated bake-off, actual search grounding, Firebase account linking and cross-user isolation on Firestore, Cloud Tasks OIDC dispatch, four Google voices, private storage exports/deletion and consented BigQuery telemetry. Live credentials must stay outside Git. A configured indicator is not a successful API probe.

# Vercel and Render hosting

The selected target is Vercel Hobby for Next.js and a Render Free web service
for FastAPI. Firebase Authentication and Firestore remain in the existing Google
project. Git stays local. Source transfer uses Vercel CLI and, with explicit user
approval, a private Docker Hub backend image.

## Backend

Build `deploy/render.Dockerfile` from the repository root. It copies only locked
dependencies and `backend/`; credentials are supplied at runtime. Deploy the
immutable image tag through Render's **Existing Image** workflow, with a read-only
registry credential. Select **Free**, expose `PORT`, and set health path `/health`.

Set these environment variables in Render:

| Variable | Value |
|---|---|
| `APP_MODE` | `live` |
| `STORAGE_BACKEND` | `firestore` |
| `INLINE_WORKER` | `true` |
| `WORKER_POLL_SECONDS` | `30` |
| `PUBLIC_APP_URL`, `ALLOWED_ORIGINS` | Exact Vercel production HTTPS origin |
| `AUTH_COOKIE_SECRET` | Persistent random secret, at least 32 characters |
| `FIREBASE_PROJECT_ID`, `GOOGLE_CLOUD_PROJECT` | Existing Google project ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | `/etc/secrets/google-credentials.json` |
| `GROQ_API_KEY` | Existing Groq server key |
| `GROQ_REASON_MODEL` | `qwen/qwen3.8-27b` |
| `GROQ_FAST_MODEL` | `openai/gpt-oss-20b` |
| `LLM_REASON_CHAIN`, `LLM_FAST_CHAIN` | `groq` |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` | Existing Firebase web configuration |

Add the existing service-account JSON as a **Secret File** named
`google-credentials.json`. Add optional provider keys only when their integrations
are enabled. Google Search grounding is currently unavailable for this account;
the app must report unavailable research rather than fabricate sources. Do not
enable billing to resolve this silently.

The inline worker runs inside the API process and claims durable Firestore jobs.
Enqueue wakes it immediately; idle polling and heartbeat writes occur every 30
seconds. A terminated job resumes after its durable lease expires. Render must
use one API process, as configured in `backend.hosted`.

## Frontend

Deploy from `frontend/` using the official Vercel CLI and the signed-in Hobby
workspace. Set build environment variables:

- `NEXT_PUBLIC_API_URL=same-origin`
- `API_INTERNAL_URL=https://<actual-render-service>.onrender.com`

Next.js rewrites `/api/*` to Render. Keeping browser requests on the frontend
origin preserves protected guest cookies and avoids cross-site cookie failures.
Changing the backend URL requires a new frontend build. Server provider keys and
the Google service-account JSON belong only in Render, never in Vercel source.
`.vercelignore` excludes local environment files, caches and test artifacts.

Authorize the exact production frontend domain in Firebase Authentication before
testing Google sign-in. Keep Render's allowed origins limited to intended domains.

## Free-plan limits

Render Free provides 512 MB memory and sleeps after 15 minutes without traffic;
the first request can take about a minute to wake it. Its filesystem is ephemeral,
so the hosted entry point rejects SQLite. Free background-worker services are not
available; the API includes its worker. Do not use artificial keepalive traffic.

Vercel Hobby is for personal, noncommercial projects. Free hosting does not make
external AI, Firestore or Google service quotas unlimited. Provider quota failures
remain visible and recoverable.

## Verification

`docker compose -f compose.hosted-check.yaml up -d --build` starts an isolated
demo at `http://localhost:3001`, using the same inline-worker container and
frontend proxy configuration. It does not validate hosted credentials.

On October 8, 2026 the production build, frontend type check, 61 backend tests and
all five browser regression tests passed. The backend image credential filename
scan was empty. Idle backend memory was approximately 51 MB. Cloud deployment
and the complete hosted live-key workflow remain pending.

The approved private backend image was uploaded to
`stk124/pitchgrill-backend:hosting-20261008`, digest
`sha256:8ae6edd3131eecd92a7c39f761ad7e7c5754acb02c75522a48278e9181431f5d`.
Render still requires its registry pull credential. No Git source was pushed.

Sources: [Render Free](https://render.com/docs/free),
[prebuilt image deployment](https://render.com/docs/deploying-an-image),
[Vercel CLI](https://vercel.com/docs/cli/deploy),
[Vercel Hobby](https://vercel.com/docs/plans/hobby).

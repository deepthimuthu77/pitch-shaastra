# Groq dialogue with Google production services

Copy `.env.example` to the repository-root `.env`. Keep the default `APP_MODE=demo`
until the Firebase and provider configuration is ready. Do not send secrets through
chat or put server keys in `NEXT_PUBLIC_*` values.

## Credentials for the investor room

| Value | Purpose | Where to get it |
| --- | --- | --- |
| `GROQ_API_KEY` | Panel, verdicts and negotiation dialogue | [Groq API keys](https://console.groq.com/keys) |
| `GEMINI_API_KEY` | Cited Google Search research; optional model fallback | [Google AI Studio](https://aistudio.google.com/apikey) |
| `GOOGLE_CLOUD_PROJECT`, `FIREBASE_PROJECT_ID` | Runtime project and verified sign-in | Google Cloud / Firebase console |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase web app registration | Firebase project settings, web app SDK config |
| `GOOGLE_CREDENTIALS_FILE` | Local Docker ADC/service-account JSON mount for Firestore, Firebase revocation checks and speech | A private file outside the repository; Cloud Run uses its attached identity instead |

Use this live configuration in `.env`:

```dotenv
APP_MODE=live
STORAGE_BACKEND=firestore
LLM_REASON_CHAIN=groq
LLM_FAST_CHAIN=groq
GROQ_API_KEY=YOUR_PRIVATE_GROQ_KEY
GROQ_REASON_MODEL=qwen/qwen3.8-27b
GROQ_FAST_MODEL=openai/gpt-oss-20b
SEARCH_CHAIN=google
GEMINI_API_KEY=YOUR_PRIVATE_GOOGLE_RESEARCH_KEY
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT
FIREBASE_PROJECT_ID=YOUR_PROJECT
NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_FIREBASE_WEB_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT.firebaseapp.com
NEXT_PUBLIC_FIREBASE_APP_ID=YOUR_FIREBASE_WEB_APP_ID
GOOGLE_SPEECH_ENABLED=true
GOOGLE_CREDENTIALS_FILE=C:/private/google-credentials.json
```

`LLM_REASON_CHAIN=groq` keeps dialogue on Groq. Add `,gemini` only if you want
Google model fallback. Google Search is independent of the dialogue chain.
Both configured Groq model IDs are in the current [model catalog](https://console.groq.com/docs/models).
Qwen 3.8 27B is a preview model: it is the reasoning-quality candidate selected
for the panel, not a production availability guarantee. Validate it against the
pitch bake-off before qualifying live quality. GPT-OSS 20B remains the fast model;
GPT-OSS 120B is not configured.
Free-plan access has organization-level request and token limits; check your
[account limits](https://console.groq.com/settings/limits). Free access does not
provide unlimited capacity or a production availability guarantee.

Enable Google and Anonymous sign-in and authorize the frontend domain. Create
Firestore in Native mode and apply `firestore.rules`. Enable the Speech-to-Text
and Text-to-Speech APIs for Google voices. Follow [Google setup](google-cloud.md)
for IAM permissions and deployment. Billing and quota eligibility depend on the
Google project; the app does not provision cloud services automatically.

Start the production configuration locally:

```sh
docker compose -f compose.yaml -f compose.google.yaml up --build
docker compose -f compose.yaml -f compose.google.yaml exec api python -m backend.llm.check
```

The unmodified `docker compose up` remains the credential-free demo command.
The override is needed only to mount a private credential file. Native launchers
read the same root `.env`; native ADC uses `GOOGLE_APPLICATION_CREDENTIALS` or
`gcloud auth application-default login` instead of the Docker file mount.

Production host URLs also need matching `PUBLIC_APP_URL`, `ALLOWED_ORIGINS` and
`NEXT_PUBLIC_API_URL`; rebuild the frontend when its public API URL changes.

## Optional services

`GCS_BUCKET` archives explicitly requested exports; `BIGQUERY_DATASET` receives
consented practice metrics; `GOOGLE_SECRET_PREFIX` loads server keys from Secret
Manager; `CLOUD_LOGGING=true` enables redacted operational events. Deployment
can use the existing Cloud Tasks, Cloud Run, Build and Artifact Registry setup.
These use project IAM credentials and resource names, rather than additional API
keys. They are not required to hear a convincing investor conversation.

The room soundtrack is synthesized in the browser and requires no service.
Browser speech is available without Google voice configuration. Audio is opt-in,
and the room soundtrack ducks while speaking or listening. Google voices require
selecting the Google voice option; having a credential alone does not send audio.

Negotiation terms remain enforced by the simulation rules. A short optional model
call adds investor dialogue after a deal action; timeout, unavailable providers,
unexpected positions and unsupported numeric statements use rules-based dialogue.
This is fictional investment practice, with no real offers or contracts.

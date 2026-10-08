# Google services: purpose, setup and verification

The demo needs none of these credentials. Enable services incrementally and keep `.env` and private JSON credentials outside Git. No cloud resource is created by normal demo startup.

## First live configuration

1. Create a Google Cloud / Firebase project. Register a Firebase web app; enable **Anonymous** and **Google** authentication. Add localhost and your actual frontend hostname to Firebase authorized domains. Google account linking preserves a new anonymous user's UID; an already registered Google identity may require signing out and signing into that existing workspace. Export guest data first in that case.
2. Create a Firestore **Native mode** database. Apply `firestore.rules` using `firebase deploy --only firestore:rules,firestore:indexes --project YOUR_PROJECT`. Browser writes are denied; the server uses IAM and validates ownership for every operation.
3. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey). Confirm current available thinking models and quotas in the [compatibility documentation](https://ai.google.dev/gemini-api/docs/openai). Defaults are configurable, not promises that a model is available in every account.
4. Copy `.env.example` to `.env` and set:

```dotenv
APP_MODE=live
STORAGE_BACKEND=firestore
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT
FIREBASE_PROJECT_ID=YOUR_PROJECT
GEMINI_API_KEY=YOUR_PRIVATE_KEY
NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_PUBLIC_FIREBASE_WEB_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT.firebaseapp.com
NEXT_PUBLIC_FIREBASE_APP_ID=YOUR_WEB_APP_ID
```

Firebase web configuration is public. Gemini and fallback-provider keys are server-only. The web config is served by `/api/config`, so those Firebase values belong in the backend environment too.

For native development, use `gcloud auth application-default login` with a least-privileged development identity, or set `GOOGLE_APPLICATION_CREDENTIALS` to a private service-account JSON path. For containers, mount ADC or service-account credentials read-only:

```dotenv
GOOGLE_CREDENTIALS_FILE=C:/private/google-adc.json
```

```sh
docker compose -f compose.yaml -f compose.google.yaml up --build
```

The override mounts only API and worker credentials. Cloud Run uses its attached service identity instead of a downloaded key. Never copy credentials into an image. See [Firebase account linking](https://firebase.google.com/docs/auth/web/account-linking) and [Google sign-in](https://firebase.google.com/docs/auth/web/google-signin).

## Relevant integrations

| Service | Product role | Enable / verify |
|---|---|---|
| Gemini | Reasoning panel, structured assumptions, synthesis and claim extraction | `GEMINI_API_KEY`; run `python -m backend.llm.check` and bake-off |
| Google Search grounding | Current cited market and competitor pointers | Same Gemini key, approved generic terms and research checkbox; inspect Sources |
| Firebase Auth | Anonymous-to-Google identity, revocation-aware server validation | Firebase project/web config, enabled auth providers; test two-user isolation |
| Firestore | Shared durable jobs, records, leases and version sections | `STORAGE_BACKEND=firestore`, ADC, Datastore User role; restart services and resume |
| Secret Manager | Server-side provider-key loading without embedding keys | `GOOGLE_SECRET_PREFIX=pitchgrill`, Secret Accessor on named secrets only |
| Cloud Speech-to-Text | Transcribes an explicitly recorded short founder answer | `GOOGLE_SPEECH_ENABLED=true`, ADC and API; choose Google speech in room |
| Cloud Text-to-Speech | Four distinct investor voices | Same flag; choose Google voice on response; typing/browser voices remain available |
| Cloud Storage | Private user-requested JSON report archive | `GCS_BUCKET`, Object User scoped to that private bucket; click Archive |
| BigQuery | Opt-in de-identified practice telemetry | `BIGQUERY_DATASET`, table from `deploy/bigquery.sql`, dataset-scoped Data Editor |
| Cloud Tasks | OIDC-authenticated durable analysis dispatch to Cloud Run | Queue/location/target/task identity settings below; observe seven stages |
| Cloud Logging | Operational error type and opaque analysis hash | `CLOUD_LOGGING=true`, Logs Writer; no idea, transcript, email or provider key logged |
| Cloud Run | Hosts API and frontend containers | Deploy image with proper port, runtime identity, timeout and origins |
| Artifact Registry / Cloud Build | Stores reproducible images and builds the two services | `deploy/cloudbuild.yaml`; authorized manual deployment only |

Search uses the native Gemini grounding API, separately from the structured-chat gateway. It displays Google search suggestions from the grounding response in a sandboxed frame. Retrieved excerpts are capped; the application does not crawl user URLs. Source IDs are assigned locally and extracted facts must quote the supplied excerpt. See [Search grounding](https://ai.google.dev/gemini-api/docs/google-search).

Secret names follow `PREFIX-gemini-api-key`, `PREFIX-groq-api-key`, `PREFIX-openrouter-api-key`, `PREFIX-tavily-api-key`, `PREFIX-serper-api-key`. Environment values take precedence. Missing optional secrets are reported without disclosing their contents. Other providers can remain unset.

For private exports, enable uniform bucket access and public-access prevention. Give the runtime identity only bucket-scoped object access. Configure a lifecycle deletion policy matching your retention period. BigQuery receives only an opaque session hash, score, difficulty, answer count and timestamp when the founder opts in; it receives no transcript, title, UID or email. `deploy/bigquery.sql` is an explicit starter table with expiry, not an automatically provisioned dataset. Configure rolling retention with your operational policy before prolonged use.

## Cloud Run deployment recipe

These are **manual commands for your cloud project**, not operations performed during development. They create billable resources. Replace every `YOUR_*` value. Use an immutable build/image tag.

```sh
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com firestore.googleapis.com secretmanager.googleapis.com cloudtasks.googleapis.com logging.googleapis.com --project YOUR_PROJECT
gcloud artifacts repositories create pitchgrill --repository-format=docker --location=us-central1 --project YOUR_PROJECT
gcloud iam service-accounts create pitchgrill-api --project YOUR_PROJECT
gcloud iam service-accounts create pitchgrill-tasks --project YOUR_PROJECT
gcloud tasks queues create pitchgrill-analysis --location=us-central1 --max-concurrent-dispatches=2 --max-dispatches-per-second=1 --max-attempts=5 --min-backoff=300s --max-backoff=900s --project YOUR_PROJECT
gcloud builds submit --config deploy/cloudbuild.yaml --substitutions=_API_URL=https://YOUR_API_HOST --project YOUR_PROJECT
```

Grant the API identity `roles/firebaseauth.viewer` for revocation-aware user checks ([role reference](https://cloud.google.com/iam/docs/roles-permissions/firebaseauth)), `roles/datastore.user`, `roles/cloudtasks.enqueuer`, secret-scoped `roles/secretmanager.secretAccessor` and `roles/logging.logWriter`. Grant optional speech/storage/BigQuery permissions only for enabled features. The API identity also needs `roles/iam.serviceAccountUser` **on the task identity** so it can attach that OIDC identity. Give task identity `roles/run.invoker` on the API service. Cloud Tasks' service agent needs its documented token-minting permissions. Do not grant project Owner to the runtime.

Edit `deploy/api-env.example.yaml` into a private ignored `deploy/api-env.yaml`. Use the API's HTTPS URL as `CLOUD_TASKS_TARGET` and exact frontend URL as `ALLOWED_ORIGINS` / `PUBLIC_APP_URL`. Store Gemini key in Secret Manager. Deploy with a service port matching the image:

```sh
gcloud run deploy pitchgrill-api --image us-central1-docker.pkg.dev/YOUR_PROJECT/pitchgrill/api:YOUR_BUILD_ID --port 8000 --region us-central1 --service-account pitchgrill-api@YOUR_PROJECT.iam.gserviceaccount.com --env-vars-file deploy/api-env.yaml --allow-unauthenticated --timeout 900 --memory 1Gi --concurrency 8 --max-instances 3 --project YOUR_PROJECT
gcloud run deploy pitchgrill-web --image us-central1-docker.pkg.dev/YOUR_PROJECT/pitchgrill/web:YOUR_BUILD_ID --port 3000 --region us-central1 --allow-unauthenticated --set-env-vars API_INTERNAL_URL=https://YOUR_API_HOST --memory 512Mi --max-instances 3 --project YOUR_PROJECT
```

The API is reachable by browsers, but product endpoints require Firebase tokens; `/api/internal/job` independently validates the task's Google OIDC audience, verified email and exact configured identity. Never deploy with `APP_MODE=demo` publicly for real users. Use Firestore on Cloud Run; its local disk is ephemeral.

On an initial deployment, create the API first to discover its URL, then build/redeploy the frontend with that exact `_API_URL`. The frontend browser API URL is a build argument. Update allowed origins once the web URL is known and add that hostname to Firebase. Cloud Tasks replaces the polling worker for cloud processing; do not run an infinite polling worker on a request-scoped Cloud Run service. The local Compose worker remains the fallback for local live operation.

Provision a Cloud Run **maintenance job** with the API image and command `python -m backend.maintenance`, the same environment and service identity. Schedule it daily or execute it manually to apply database retention; set corresponding bucket lifecycle and BigQuery retention. The local worker already performs database maintenance hourly.

Cloud Tasks HTTP dispatch deadlines default below the full analysis budget, so the adapter requests a 900-second deadline. This matches the 900-second lease and configured Cloud Run request timeout; each model call also has its own deadline. See [HTTP target tasks](https://cloud.google.com/tasks/docs/creating-http-target-tasks), [Cloud Run timeouts](https://cloud.google.com/run/docs/configuring/request-timeout) and [container deployment](https://cloud.google.com/run/docs/deploying).

## Acceptance after credentials are supplied

Run the probe and repeated bake-off; inspect provider/model, elapsed time, reasoning-token metadata when reported, structured schema success and visible degradation. Confirm source citations resolve, upload/transcribe a short WebM sample, play all four voices, archive and delete a report, and verify consented telemetry. Test cross-user access, anonymous account linking, task OIDC rejection, share expiry and deletion on real Firestore. No adapter is labelled credential-verified until these checks succeed.

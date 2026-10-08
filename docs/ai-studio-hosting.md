# AI Studio Starter Tier hosting requirement

This records the attempted Google AI Studio no-billing Starter Tier route. The
account was rejected; the user selected [Vercel + Render](free-hosting.md). The local
`docker compose up` demo and Windows/Linux/macOS launchers remain required.
Groq handles investor reasoning and dialogue; Gemini handles consented Google
Search research. Server keys must stay out of browser bundles and source uploads.

## Verified platform constraints

Checked against Google's documentation on October 8, 2026:

- Eligible individual Google accounts can publish up to two apps/services without
  a Cloud Billing account. Having no previous billing meets only one eligibility
  condition. Workspace accounts and insufficient account activity can also prevent
  access. Google determines availability.
- Starter Tier deploys to Cloud Run in a Google-managed project. Region, IAM,
  quotas and enabled APIs are managed by Google. Firebase Authentication and
  Firestore are included supported resources. Additional Google Cloud APIs cannot
  be enabled in that managed project.
- AI Studio documents a Node.js server runtime and server-side Secrets settings.
  It does not document support for importing and running this Python FastAPI
  backend and durable worker unchanged.
- The documented existing-code import uses GitHub. This repository's no-push rule
  remains in force. A supported manual file transfer route must be verified before
  claiming this repository has been imported into AI Studio.
- Hosting allowances do not establish free availability of external model calls,
  search grounding or Google cloud speech. Keep browser speech available and
  verify each provider's quota separately.

## Adaptation and acceptance gates

This is a deployment requirement and compatibility assessment, not a completed
hosted implementation or a claim that the application is already deployed.

### Account check result

On October 8, 2026, the signed-in account's Publish panel was inspected in Chrome.
After selecting Get started, AI Studio displayed `You are not eligible for the
Starter Tier`, `No billing setup`, and a Set up billing button. This check used an
existing app solely to inspect deployment settings; that app was not modified or
published. No billing was enabled and PitchGrill was not uploaded.

No-billing AI Studio deployment is blocked for this account. The UI does not
identify the eligibility reason, so do not infer prior billing or account status.
Confirm an eligible account or a different hosting target before building a
platform-specific adapter. Local user-flow testing is paused at the user's request.

1. Confirm Starter Tier availability with the user's signed-in personal account.
2. Verify the source transfer and runtime capabilities in that account's UI.
3. Build a supported deployment adapter. If the platform provides only Node.js,
   port the Python API, financial calculations and job execution with behavioral
   parity rather than publishing a frontend with missing backend functions.
4. Preserve authentication, owner isolation, consent, flag review, financial
   provenance, negotiation safeguards and provider metadata. Replace continuous
   worker assumptions with a supported durable request-driven execution strategy.
5. Verify the complete hosted pitch, analysis, negotiation, export and retry flows;
   retain the local Docker and native checks.
6. Add provider keys through Settings -> Secrets and authorize the final hosting
   domain in Firebase. Local `.env` and downloaded credential JSON files must not
   be uploaded as source or pasted into a generation prompt.
7. Review the concrete tested app and deployment configuration before publishing.

Standard Cloud Run deployment remains a separate option requiring a billing
account, even when expected usage falls inside its free allowance. Do not switch
to that path or enable billing silently.

Sources:

- [AI Studio deployment and eligibility](https://ai.google.dev/gemini-api/docs/aistudio-deploying)
- [Starter Tier resources and restrictions](https://docs.cloud.google.com/docs/starter-tier)
- [AI Studio runtime and source import](https://ai.google.dev/gemini-api/docs/aistudio-build-mode)
- [Server-side secrets](https://ai.google.dev/gemini-api/docs/aistudio-fullstack)

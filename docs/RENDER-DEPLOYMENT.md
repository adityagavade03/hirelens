# Independent HireLens hosting on Render

The owner selected independent cloud hosting on 22 October 2026 after laptop
shutdowns interrupted the earlier preview. The root `render.yaml` now describes
the intended **Free Node 24 application service**, with external durable MongoDB
and HTTPS email. This configuration is prepared; it does not claim that the
database, provider accounts, data migration or cloud cutover have completed.

The existing public address is `https://hirelens-adityagavade03.onrender.com`.
Keep the working gateway until the independent application's dependencies and
data are ready. Updating this file alone does not change the running service.

## Application service

Use the repository root, Node runtime, Free plan, one instance and automatic
deployments off. The UI, API, background screening/delivery and Socket.IO run
together. Use `/api/health` as the health path and `npm start` as the start command.
The Blueprint derives the exact HTTPS `APP_ORIGIN` from `RENDER_EXTERNAL_URL`.

The build command is deliberately explicit about development dependencies:

```sh
MONGOMS_DISABLE_POSTINSTALL=1 npm ci --include=dev && npm run setup:assets && npm run build && node scripts/check-cloud-connectivity.mjs --synthetic && npm prune --omit=dev
```

`NODE_ENV=production` would otherwise omit tools needed by the build. Asset setup
downloads checksum-pinned camera models, WASM and OCR language data; the build
generates both `dist` and `dist-server`. Pruning happens only after compilation.
The build does not seed accounts or copy the ignored `.data` directory. The
explicit synthetic probe checks the configured Brevo sender and an AI JSON
response from the build environment without sending email or real applicant data.
A configured provider failure stops the build and leaves the previous deployment
available. Free-provider rate limits can therefore require a later deploy retry.

## Required private configuration

| Settings | Required preparation |
| --- | --- |
| `MONGODB_URI` | A durable MongoDB Atlas Free cluster, restricted app database user and Render outbound IP allowlist. Set the URI in Render's secret environment. |
| `OTP_HASH_SECRET` | Independently generated secret, at least 32 characters; the Blueprint generates a value for a new deployment. Preserve it across ordinary redeploys. |
| `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `EMAIL_FROM` | Active Brevo transactional account, private API key and a sender authorized by that account. HireLens uses its direct HTTPS adapter. |
| `STORAGE_BUDGET_MB=400`, `STORAGE_BUDGET_SCOPE=atlas-cluster` | Shared binary-upload guard below Atlas Free's 0.5 GB total quota; verify Atlas cluster-size statistics work with the app user. |
| `REDIS_URL` | Empty for this single-instance deployment. Multiple instances require separate scaling configuration. |

Keep `MESSAGE_PREVIEW`, `ALLOW_DEMO_LOGIN`, `ALLOW_LOCAL_COMPANY_REGISTRATION`
and `TURN_LOCAL_DEV` false. Production keeps email verification and company-login
OTP mandatory. Do not copy SMTP settings: Free Render blocks outbound SMTP ports
25, 465 and 587. Brevo acceptance confirms submission, not inbox delivery; verify
an actual authorized OTP and verification link before opening the new service.
See [Brevo transactional email](https://developers.brevo.com/docs/send-a-transactional-email).

For independent AI and speech, configure hosted authenticated endpoints privately:

- `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` for screening, interview questions and reports.
- `STT_BASE_URL`, `STT_API_KEY`, `STT_MODEL` for saved audio transcription.

Groq is an optional OpenAI-compatible provider. Its base URL for both groups is
`https://api.groq.com/openai/v1`; select currently available models in the account
and validate the returned JSON and transcription. An account/key and its usage
allowance are still required. Provider configuration is not an accuracy test.
Omit local Ollama, Whisper and diarization addresses: cloud localhost does not
refer to the owner's laptop. See [Groq compatibility](https://console.groq.com/docs/openai)
and [speech models](https://console.groq.com/docs/speech-to-text).

## Existing accounts and unverified test companies

A new cloud database starts empty. Make a private backup and explicitly migrate
the intended accounts and recruitment records, preserving BSON binary data,
IDs, password hashes and references. Do not seed dummy records, change passwords,
mark email/company verification complete or copy pending delivery work without
review. Require fresh sign-in after cutover. Keep the original database intact
until migration counts and application behavior have been checked.

Unverified development companies remain unverified. For an owner-approved cloud
test only, set both `CLOUD_TEST_COMPANY_IDS` and `CLOUD_TEST_EXPIRES_AT` privately.
The policy permits one or two exact company IDs and an original absolute UTC
deadline within 31 days. Do not publish the IDs or automatically renew the date.
The service requires an exact public HTTPS `APP_ORIGIN`; all `PRIVATE_PREVIEW_`
keys must be absent, including blank keys. Partial, invalid or already-expired
settings fail closed at startup. At the original deadline, the entire test
workspace closes: public pages, candidate/company/HR access, APIs, static assets,
health checks and Socket.IO are denied. Existing sockets disconnect. Removing
the test settings must not be used to renew or bypass this authorized period;
further public access requires a new explicit authorization. The UI displays
the workspace deadline.

This exception permits selected existing test companies and their role-scoped
members; it does not enable general unverified company signup, issue verification
receipts or bypass email verification and OTP. Real onboarding still requires
the actual business-verification provider.

## Data limits and checks before cutover

Resumes, company logos and interview recording chunks are stored in MongoDB,
not the web service's filesystem. Atlas Free's quota includes uncompressed BSON
documents and indexes across the cluster. The shared upload guard checks cluster
usage before saving a binary upload, serializes concurrent uploads and fails
closed if capacity cannot be checked. Its 400 MiB ceiling leaves headroom; it
does not replace provider quota monitoring, backups or retention. Ordinary
records and indexes can still grow. Do not use the small free cluster for
unrestricted interview recordings. [Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)

Before replacing the gateway, verify the production build, migrated record
counts/references, Mongo connectivity, private provider settings, storage
statistics and the exact public origin. Render supports updating an existing
service's runtime/source settings so the established address can be retained.
Once readiness passes, pause the obsolete laptop recovery controller before
changing Render's configuration, so it cannot overwrite the cloud configuration
with a new tunnel address. The existing preview process can remain available
briefly for a deliberate rollback.
Remove gateway `HIRELENS_PREVIEW_*`/`HIRELENS_BACKEND_ORIGIN` settings and all
`PRIVATE_PREVIEW_*` settings when switching to the direct application; do not
deploy a second forwarding layer dependent on the laptop. [Render runtime changes](https://render.com/docs/native-runtimes)

After deployment, check `/api/health`, all role login pages, anonymous-data
rejection, same-origin protections, company OTP delivery and account verification
links. Exercise a real test job/application, AI screening and HR assignment.
Check Socket.IO and recording playback separately. Stop the obsolete laptop
preview after the cloud service is verified. A successful health probe proves
database readiness, not the rest of these workflows.

## Remaining service limits

Free Render can sleep after 15 idle minutes, take about a minute to wake and
restart unexpectedly. Services share 750 free instance hours per workspace each
calendar month, plus bandwidth/build limits. Background screening and delivery
pause during sleep. Independent hosting removes the laptop dependency; it does
not provide guaranteed uninterrupted hiring availability. [Render Free limits](https://render.com/docs/free)

Public TURN and two-device, different-network media verification remain pending.
Private Judge0 is required for hiring code execution; the public demo remains
local-practice-only. SMS and real business verification require their own active
providers. Hosted transcription and proctoring accuracy require separate live
checks. None are marked complete by deploying the website.

The older laptop-backed gateway is documented in
[the temporary hosting record](TEMPORARY-RENDER-HOSTING-2026-10-21.md) and uses
`deploy/preview-gateway/render.yaml`, not the root Blueprint. That historical
setup needs the laptop on and retains its original expiry; it is not a fallback
to claim independent uptime.

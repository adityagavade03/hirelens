# Linux deployment and activation

The repository contains a deployment package, not an active hosting service. On 21 October 2026 no hosting account/domain, private hiring executor, public relay, SMS account or live company-verification account was supplied. The installed Docker CLI can validate Compose configuration, but this laptop's Linux Docker daemon is unavailable. No image/container startup, public TLS or cross-network interview is claimed as verified.

## Prepare an owner-controlled Linux server

Use a maintained Linux Docker Engine and Docker Compose v2 or later, a real DNS hostname and an administrator-controlled deployment directory. Point the site's DNS records to the server. Permit incoming TCP 80/443 for Caddy; UDP 443 is optional HTTP/3. Keep MongoDB, Redis and the Node app private. Only Caddy publishes web ports. This stack uses one application instance; it does not configure a load balancer or sticky sessions for multiple instances.

The independent Compose project is named `hirelens-production`, with separate MongoDB, Redis and Caddy volumes. It does not import this laptop's database, accounts or recordings. Resumes and recordings are stored in MongoDB/GridFS and must be included in private database backups. Assets are downloaded with pinned checksums during the image build; Node runs as the unprivileged `node` user. All camera detection remains separately consented and experimental.

From a fresh repository checkout:

```sh
npm ci
cp .env.production.example .env.production
chmod 600 .env.production
```

Edit the private file locally. Set `SITE_DOMAIN` to the real hostname, without `https://`, a port or a path. Independently run `openssl rand -hex 32` four times and use one different result for each database/Redis/OTP secret. Keep values out of chat, screenshots and Git. These secrets use hex so they are safe in the generated MongoDB/Redis connection URLs. Enclose provider passwords containing `$` in single quotes to prevent Compose interpolation. Avoid shell variables with the same names as file settings when manually running Compose: the shell can override `--env-file` interpolation.

## Connect the existing services

Reuse [the provider setup workflow](PROVIDER-ACTIVATION.md), rather than inventing credentials. Its staged `.data/provider-setup/` files do not activate anything until the administrator merges the chosen assignments into the private production environment.

| Capability                         | Required external service                                             | Activation evidence                                                   |
| ---------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Email verification and company OTP | Authorized SMTP or HTTPS email adapter, sender address and OTP secret | Receive and use a fresh email link/code                               |
| SMS                                | Authorized Twilio sender/Messaging Service or HTTPS adapter           | Confirm actual phone delivery                                         |
| Legal company verification         | Live Cashfree Secure ID CIN access or documented HTTPS adapter        | A representative verifies the actual company; sandbox is insufficient |
| Hiring code execution              | Authenticated private Judge0-compatible host                          | Run all eleven synthetic execution checks                             |
| Interviews across networks         | Public HMAC Coturn host or Twilio TURN                                | Relay probe, then a full interview on two networks                    |
| AI interviews/resume screening     | Authorized OpenAI-compatible HTTPS chat endpoint, key and model       | Reviewed resume/JD and interview quality checks                       |
| Transcription                      | HTTPS transcription endpoint, key and model                           | Review an actual recorded script and both participants' audio         |
| Optional speaker clustering        | HTTPS diarization endpoint and key                                    | Consented, reviewed physical tests; no identity/cheating claim        |

Production requires verified candidate/HR email and company OTP. The development-only unverified company-registration path is unavailable. An unconfigured verification provider therefore prevents real company onboarding; deployment does not silently verify existing local companies.

Container `localhost` is the application container. It does not reach services on this laptop or on the Linux host. Set reachable authenticated HTTPS provider endpoints. The production Compose package does not publish the local Ollama, Whisper, WSL relay or development Judge0 services. Keep the privileged Judge0 sandbox on a dedicated compatible execution host; see [code execution](CODE-EXECUTION.md). Coturn needs its own public listeners/certificate and relay UDP range, as explained in [TURN setup](TURN-SETUP.md); Caddy's web proxy does not relay WebRTC UDP media.

## Validate before launching

This read-only preflight loads only the selected production file, checks domain/secrets and container URLs, and reuses the existing provider checker. It neither sends messages nor activates accounts. It does not borrow this laptop's working Gmail, public practice runner or local relay settings.

```sh
npx tsx scripts/production-preflight.ts --compose --require-integrations
```

`--require-integrations` fails if any of the external services in the table lacks configuration. For a deliberately incomplete staging installation, omit that flag to validate the base configuration and report missing integrations without claiming the complete platform is ready. `--compose` calls `docker compose config --quiet`, which does not require a running Docker daemon and avoids printing expanded secrets. `--env-file /private/path/file.env` selects a different private file for both checks. A configuration pass does not prove provider credentials, delivery, DNS, TLS or actual media accuracy.

## Start and verify on the server

Run these commands only on the intended server, outside active interviews:

```sh
docker compose --env-file .env.production -f compose.production.yaml up -d --build --wait
docker compose --env-file .env.production -f compose.production.yaml ps
curl --fail --silent --show-error https://YOUR_REAL_DOMAIN/api/health
```

The app waits for healthy MongoDB and authenticated Redis; Caddy waits for the app health check. `/api/health` returns 503 if MongoDB or configured Redis is unavailable. The internal app port is fixed at 4000 to match Caddy. Log rotation bounds local container logs. Health checks report readiness but do not automatically restart a running unhealthy process; investigate dependencies and use an external monitor before relying on this as a production service.

Caddy obtains/renews a public certificate when the real DNS name resolves correctly and the required ports and writable persistent certificate storage are available. Do not bypass browser certificate errors or enable insecure cookie settings. Open the site from another network and verify all three role sign-ins, fresh verification email/company OTP, job/application workflow, an assigned HR interview, coding execution, screen sharing, reconnection, recording/playback and provider errors. A successful same-laptop relay probe cannot certify the two-network test.

For an update, build the new image first, back up MongoDB, then recreate the app during an agreed maintenance period. Never use `down -v` to update: it deletes persistent volumes. MongoDB initialization runs only on an empty data volume; editing password variables does not rotate an existing database user. Rotate stored users and deployment values together through an authorized database operation.

## Backups and recovery

Schedule encrypted off-server database backups with an administrator-owned retention policy. For an initial private archive on Linux, from the repository directory:

```sh
umask 077
docker compose --env-file .env.production -f compose.production.yaml exec -T mongo sh -c 'exec mongodump --host 127.0.0.1 --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db hirelens --archive --gzip' > hirelens-backup.archive.gz
```

Check the command's exit status and archive size; encrypt and transfer the result to private storage. The archive contains recruitment records, resumes and recordings. Restore it into an isolated test database and verify files, accounts and interview history before treating the backup plan as proven. No backup or restore was run against the user's current workspace during this task. Caddy certificate/config volumes also persist across container replacement; preserve the private production environment separately through the owner's secret-management process.

Official references: [Compose startup/readiness](https://docs.docker.com/compose/how-tos/startup-order/), [Compose variable precedence](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/), [Caddy automatic HTTPS requirements](https://caddyserver.com/docs/automatic-https), [MongoDB backup tool](https://www.mongodb.com/docs/database-tools/mongodump/).

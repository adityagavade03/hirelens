# Free provider address for HireLens

Status: prepared configuration only. No Render account, cloud database or new
hosted URL has been provisioned. The laptop's temporary Cloudflare preview is a
separate running deployment. The hostname assigned by Render is not reserved by
this repository.

`render.yaml` defines one **Free** Docker web service. It reuses the existing
Node 24 image, serves the UI/API/Socket.IO together, checks `/api/health`, and
derives `APP_ORIGIN` from Render's assigned HTTPS URL. It creates no paid workers,
database, persistent disk or custom domain. Automatic code deployments are off.
If you rename the service, update both its name and the APP_ORIGIN self-reference.

## Required before creating the service

1. Sign into [Render](https://dashboard.render.com/register) with the account
   that should own the deployment. The existing public source repository is
   `https://github.com/adityagavade03/hirelens`.
2. Create an external MongoDB database, for example an Atlas Free cluster.
   Add Render's outbound IP ranges to Atlas Network Access, create a restricted
   database user for this app, and enter its connection URI directly into Render's
   secret environment fields. Do not commit it or paste it into chat.
3. Connect a working HTTPS email adapter. Free Render blocks outbound SMTP ports
   25, 465 and 587, so this laptop's Gmail SMTP configuration does not transfer.
   `EMAIL_DELIVERY_URL` must implement the existing HireLens adapter contract in
   [delivery setup](DELIVERY-AND-VERIFICATION.md), including `{ accepted: true,
   messageId: "..." }`. A vendor's raw API URL is not a drop-in replacement.
4. Plan company onboarding. The existing laptop company is explicitly a local,
   unverified company. Normal production blocks that account; obtain actual
   business verification before using it as a real company. Do not change its
   status or disable production authentication to bypass this requirement.

After the configuration is available in the deployment's selected Git branch,
create a Blueprint from that branch and `render.yaml`. Review that the sole
service uses the **Free** plan, enter the requested private fields in Render,
and deploy. Render assigns the actual `onrender.com` URL. For a future custom
domain, update APP_ORIGIN to its exact HTTPS origin and configure DNS/TLS there.

## Data and feature limits

- A new cloud database starts empty. Local accounts, jobs, resumes and recordings
  do not transfer automatically. A deliberate private backup/migration is needed
  to retain existing data; no migration has been performed.
- Recordings are stored in MongoDB. Small free database quotas are unsuitable for
  unrestricted interview recording. Check available capacity and retention before
  any real recording; the app does not enforce an aggregate database quota.
- Ollama and Whisper on laptop localhost are not reachable from Render. AI and
  speech require separately hosted, authenticated endpoints. Set these and other
  provider assignments through Render's private environment, using
  `.env.production.example` and [provider activation](PROVIDER-ACTIVATION.md).
- Public TURN is still necessary for reliable interviews on different networks.
  Hiring code execution, SMS and legal verification also need their own services.
- Free Render sleeps after 15 minutes without inbound traffic and can restart.
  Background screening/delivery pauses while it sleeps. The plan has usage limits;
  it is appropriate for testing, not dependable live hiring. This configuration
  does not add keep-awake traffic or a paid upgrade.

## Verify after a real deployment

Confirm public `/api/health` is ready, the three role login pages load, account
data rejects anonymous requests, company OTP arrives, and email links use the
assigned HTTPS address. Then test actual verified accounts, job application and
AI screening, HR assignment, and a two-device interview. Verify recordings and
storage separately. A passing build or health check does not prove these services.

Official references: [Render web services](https://render.com/docs/web-services),
[free-plan limits](https://render.com/docs/free),
[Atlas connection](https://render.com/docs/connect-to-mongodb-atlas), and
[Blueprint configuration](https://render.com/docs/blueprint-spec).

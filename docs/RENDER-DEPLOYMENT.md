# Free provider address for HireLens

## Fixed test address while the laptop stays on

The selected setup on 21 October 2026 is a free Render **gateway**, with the
existing application, database, Gmail and AI services continuing on this laptop.
It is temporary testing access, not independent cloud hosting. The gateway does
not automatically extend the preview's absolute expiry or expose the disposable
device test server. Normal account sign-in and company OTP still apply.

Deployed and checked on 21 October 2026:
`https://hirelens-adityagavade03.onrender.com`. The user subsequently authorized
a one-month extension at `2026-10-21T12:22:46Z`, with an approved absolute expiry
of `2026-11-21T12:22:46.000Z` (**21 November 2026 at 5:52:46 PM IST**). See the
[verification record](TEMPORARY-RENDER-HOSTING-2026-10-21.md). The fixed address
does not make the laptop backend independently hosted.

Use the separate Blueprint at `deploy/preview-gateway/render.yaml`, or create a
Free Node web service from the same deployment branch with root directory
`deploy/preview-gateway`, build command `npm ci --omit=dev`, start command
`npm start`, and health path `/__gateway/health`.

Set `HIRELENS_PREVIEW_UPSTREAM` to the exact current production preview tunnel's
HTTPS origin and `HIRELENS_PREVIEW_EXPIRES_AT` to its existing absolute expiry.
The gateway gets its public origin from Render's `RENDER_EXTERNAL_URL`. Set
`HIRELENS_BACKEND_ORIGIN` to that same public origin after starting the laptop
preview with `--public-origin https://THE_ASSIGNED_RENDER_HOST` and its original
`--expires-at` value. Use `state.json`'s `tunnelUrl` as the upstream, and `url` as
the public address. Keep these deployment settings in Render, not in committed
source. Never point the gateway at the fixture or Vite development server.

The launcher still defaults to **eight hours**. For an explicitly authorized
longer test, add `--days N` (a whole number from 1 to 31). For the month extension,
use `--days 31 --expires-at 2026-11-21T12:22:46.000Z`; set that same absolute
expiry in the gateway. On every restart, retain the authorized expiry and day
limit. Neither a restart nor a Render redeployment renews access. The laptop
guard and gateway check the absolute deadline using bounded timers, avoiding
Node's long-timeout overflow.

The gateway's health check only indicates gateway readiness. Verify the public
`/api/health` separately to check the actual application/database. Preserve
normal authentication; verify cross-origin rejection and Socket.IO after any
origin change. The normal local background-worker owner also needs the public
origin for its recruitment email links.

Keep the laptop plugged in, online and its lid open. When enabled, the bounded
AC-only keep-awake helper asks Windows to stay awake during this authorized
window; it does not change the power plan or guarantee uptime. The free Render
gateway can still sleep after 15 minutes without traffic and need time to wake
on the next visit. If the laptop, tunnel or local services stop, the address
cannot serve HireLens. The session ends at its authorized absolute expiry;
starting another test requires a new authorized session and an explicit
upstream/expiry update. Public TURN is still a separate requirement for reliable
media across different networks.

For a laptop-backed test, optional Windows recovery can run at the owner's next
sign-in and periodically during the already authorized window. It must use an
interactive, least-privilege task with a fixed end boundary, preserve the exact
company scope and expiry, and leave healthy services running. A manual preview
stop must prevent automatic restart. Keep a bounded controller alive until that
expiry so a short task timeout cannot terminate the server processes a repair
starts. Check local application/database readiness
only; email or AI provider outages must not trigger a hosting restart. Recovery
can restore a crashed local process and update a changed tunnel hostname, but
cannot serve HireLens while the laptop is powered off, signed out or offline.
It does not extend hosting, change the power plan or make this independent cloud
hosting. Keep deployment credentials in ignored local configuration.

## Independent cloud deployment

Status: prepared configuration only for an independent application server.
The free gateway above is deployed; no independent cloud database, email adapter
or model services have been provisioned. The hostname for any additional Render
service is not reserved by this repository.

`render.yaml` defines one **Free** Docker web service. It reuses the existing
Node 24 image, serves the UI/API/Socket.IO together, checks `/api/health`, and
derives `APP_ORIGIN` from Render's assigned HTTPS URL. It creates no paid workers,
database, persistent disk or custom domain. Automatic code deployments are off.
If you rename the service, update both its name and the APP_ORIGIN self-reference.

### Required before creating the service

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

### Data and feature limits

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

### Verify after a real deployment

Confirm public `/api/health` is ready, the three role login pages load, account
data rejects anonymous requests, company OTP arrives, and email links use the
assigned HTTPS address. Then test actual verified accounts, job application and
AI screening, HR assignment, and a two-device interview. Verify recordings and
storage separately. A passing build or health check does not prove these services.

Official references: [Render web services](https://render.com/docs/web-services),
[free-plan limits](https://render.com/docs/free),
[Atlas connection](https://render.com/docs/connect-to-mongodb-atlas), and
[Blueprint configuration](https://render.com/docs/blueprint-spec).

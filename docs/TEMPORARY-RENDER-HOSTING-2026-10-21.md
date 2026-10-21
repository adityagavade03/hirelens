# Fixed free test address — 21 October 2026

Public address: https://hirelens-adityagavade03.onrender.com

Role sign-in paths are `/auth/company`, `/auth/hr` and `/auth/candidate`.
The root redirects to company sign-in without an additional preview-password
screen. Existing account authentication and company OTP remain required.

The selected arrangement is a **Free Render gateway** forwarding to the existing
scoped production preview. This laptop still runs the application, database,
Gmail sender, local AI and speech services. Server provider credentials and the
recruitment database were not copied to GitHub or Render. Requests pass through the HTTPS gateway
to the local application. The disposable device fixture is excluded.

## Verified deployment

- Deployed source: `363d2f42fdbd97253e414e7cb2a108eb06078334`, from
  `codex/render-free-hosting-20261021` in `adityagavade03/hirelens`.
- Render reports the service live on the **Free** plan; automatic deployments
  are disabled. No paid database, disk, worker or custom domain was created.
- The production application build passed. All 12 gateway HTTP/WebSocket tests
  and all 13 existing private-preview checks passed.
- Public checks at `2026-10-21T12:18:04Z` confirmed the company redirect, all three
  sign-in pages, current frontend asset, ready application/database health,
  authentication on protected APIs and WebSocket connections, rejected
  cross-origin mutations, and blocked fixture bootstrap routes.
- Follow-up checks confirmed the canonical WebSocket CSP, working same-origin
  Socket.IO polling, and rejection of polling requests lacking origin evidence.
- The application canonical origin and normal background-worker link origin use
  the Render address. No test OTP or recruitment email was sent by these checks.

## Lifetime and limits

The original preview expiry remains `2026-10-21T19:31:38.572Z`, which is
**22 October 2026 at 01:01:38 IST**. Keep the laptop awake, online and its local
services running. The gateway fails closed after expiry, including existing
WebSocket connections. A gateway restart does not extend this authorization.
Starting another session requires an explicit new preview and upstream/expiry
update; the Render address can remain the same.

Free Render can sleep when unused, causing a wake-up delay. Gateway-only health
does not prove backend health; use `/api/health` for that. Internet access or
service restarts can interrupt a test. Public TURN and two-device verification
are still needed for reliable interviews on different networks. This deployment
does not validate physical media, proctoring accuracy or missing providers.

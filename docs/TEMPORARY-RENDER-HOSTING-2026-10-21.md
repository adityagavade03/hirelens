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

The initial eight-hour deployment used expiry `2026-10-21T19:31:38.572Z`.
At `2026-10-21T12:22:46Z`, the user explicitly authorized a one-month extension
ending `2026-11-21T12:22:46.000Z` (**21 November 2026 at 5:52:46 PM IST**).
The fixed Render address remains the same. This authorizes a longer
laptop-backed test, not independent hosting; activation must apply the same
deadline to the gateway and scoped laptop preview. The extension checks passed
all 13 gateway tests and all 16 private-preview tests.

Eight hours remains the launcher default. Longer windows require explicit
`--days N`, where `N` is a whole number from 1 to 31; the approved month uses
`--days 31` with the absolute expiry
above. Keep that deadline on restarts; there is no automatic renewal. The
gateway fails closed after expiry, including existing WebSocket connections.
Starting another session requires an explicit new preview and upstream/expiry
update; the Render address can remain the same.

Keep the laptop plugged in, online, with its lid open and local services running.
When enabled, the bounded AC-only keep-awake helper requests wakefulness only
during the authorized window without changing the power plan. It cannot
guarantee uptime. Free Render can still sleep after 15 minutes without traffic,
causing a wake-up delay on the next visit. Gateway-only health
does not prove backend health; use `/api/health` for that. Internet access or
service restarts can interrupt a test. Public TURN and two-device verification
are still needed for reliable interviews on different networks. This deployment
does not validate physical media, proctoring accuracy or missing providers.

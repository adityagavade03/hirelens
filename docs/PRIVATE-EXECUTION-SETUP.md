# Private code execution for hosted HireLens

Hiring execution remains private. On 1 November 2026 the owner separately
approved the official public Judge0 runner for candidate-owned personal practice
with a clear data-sharing notice. See [execution modes](CODE-EXECUTION.md).
Hiring Run/Submit still waits for a separately hosted private Judge0 service.
This package prepares that private service; it does not provision a server.

## Prepare configuration

From this repository, with Node.js dependencies installed:

```sh
npm run code:prepare:private
```

This creates or reuses private API/database/Redis secrets under `.data/judge0/`
and writes `.data/private-executor/host.env`, `render.env` and `readiness.json`.
The API key is never printed. These files are ignored by Git. Running the command
again preserves the Judge0 credentials. It does not start Docker, change a
kernel, send code, connect Render or enable a public execution endpoint.

When an owner-controlled compatible Linux host and real hostname are available:

```sh
npm run code:prepare:private -- --domain=YOUR_ACTUAL_HOSTNAME
```

Use a dedicated execution VM/host, separate from HireLens and its database.
The pinned Judge0 CE 1.13.1 stack uses privileged containers and needs the Linux
cgroup compatibility described in its official release. The current Render app
is a native Node web service; the executor is a separate service. Creating a host,
registering a domain or using a managed execution plan requires the owner's account.

## Deploy on that host

Securely transfer the prepared repository/configuration to the intended host.
Keep private files permission-restricted. Point the chosen DNS hostname to that
host. Allow the TLS gateway's ports 80/443; keep database and Redis inaccessible
from the internet. Judge0's direct API remains bound to loopback and authenticated.
The Caddy gateway exposes only language discovery, submission and polling paths.

On the dedicated compatible host, after reviewing its configuration:

```sh
docker compose --project-directory . --env-file .data/private-executor/host.env -f deploy/compose.judge0.yaml -f deploy/compose.judge0.https.yaml config --quiet
docker compose --project-directory . --env-file .data/private-executor/host.env -f deploy/compose.judge0.yaml -f deploy/compose.judge0.https.yaml up -d
```

These commands are intended for the execution host. The prepare command does not
run them. Do not disable the sandbox or run candidate code inside the HireLens
Node process to work around an unavailable executor.

## Validate, then connect Render

Use the private `render.env` values in a temporary process environment or the
execution host's ignored `.env`. Do not paste keys into chat or commit them:

```sh
npm run code:check
```

This submits eleven fixed diagnostic programs: successes in Python, JavaScript,
Java, C and C++; three compilation failures; a runtime failure; a time limit;
and a wrong-answer case. A `/languages` response alone does not establish working
execution. After all checks pass, add the four `render.env` settings to HireLens's
private Render environment and redeploy. Test Run with custom stdin, then Submit
with a correct and an incorrect solution. Hidden tests must reveal verdicts only.

Submitted programs cannot request networking, callbacks, additional files or
custom compiler arguments in the prepared configuration. Limits remain bounded.
Operator access to submitted code is possible on a private executor; apply your
own retention/access policy and back up only what you intend to retain.

Official references: [Judge0 release and host requirements](https://github.com/judge0/judge0/releases/tag/v1.13.1),
[Judge0 self-hosting](https://judge0.com/), [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https).

# Connecting the coding editor

`Code execution needs a Judge0 service` means `JUDGE0_URL` is empty. The editor and code drafts can work independently, but compiling/running code requires a real isolated executor. An arbitrary URL does not enable execution.

## Status on this computer, reviewed 13 October 2026

The approved public runner is now enabled in the local `.env`, and the API has been restarted. An isolated browser check ran a synthetic Python program successfully and then passed all four Pair sum tests through **Submit solution**. The upload notice and saved results were visually checked; normal recruitment records were untouched. This activation is for personal practice only.

At the start of this check, the Judge0 URL and API key were empty. Docker Desktop 4.74.0 is installed, but starting it failed. Its diagnostic log reports `initializing Inference manager` and failure accessing the local `Docker/run/dockerInference` socket. No Judge0 containers were started and no application endpoint/key was fabricated. No Docker factory reset, WSL shutdown, kernel change or host code execution was performed by this task.

The installed Ubuntu WSL environment reports cgroup v2. Judge0 CE 1.13.1's official deployment instructions require a compatible Linux host and describe configuring cgroup v1 on Ubuntu 22.04. A working Docker Desktop alone therefore does not guarantee Judge0 compatibility. The setup helper checks the engine and stops instead of changing kernel settings or disabling sandbox limits.

A normal hidden Docker Desktop launch was retried on 13 October and failed before its Linux engine became ready, with the same socket error. A read-only reparse-point query returned Windows error 1920. Existing Docker recovery-backup directories were preserved. Docker's maintainer reports fixes in Desktop 4.92 in [the upstream socket issue](https://github.com/docker/desktop-feedback/issues/625); an in-place update may address that startup problem, but has not been performed or verified here and would not establish Judge0's separate cgroup compatibility. Do not reset Docker, remove data volumes, or disable sandbox limits to make the status appear ready.

Check the current local engine without changing files, starting containers, or submitting code:

```sh
npx tsx scripts/local-code.ts --check
```

The helper also refuses remote/TCP Docker contexts: its loopback API and local configuration mount assume the selected Docker engine belongs to this execution host. A separately managed execution server should be connected through its authenticated Judge0 endpoint instead.

### Local VM feasibility and official demonstration check

A read-only feasibility check found accessible KVM in Ubuntu WSL, 12 logical processors, 15.26 GiB total RAM and 109.73 GiB free on C:. Windows had only 1.24 GiB RAM available during the check. A separate execution guest would need additional memory; it was not started and other applications were not stopped to make room. The official Ubuntu 22.04 cloud image was about 697 MiB and the official Judge0 1.13.1 compiler image about 3.07 GiB compressed. Expect roughly 4–5 GB of downloads and substantially more disk space after extraction. No VM image or QEMU packages were downloaded or installed. A dedicated guest remains an option when resources are available; it need not change the Windows or WSL kernel settings.

On 13 October the official `https://ce.judge0.com` demonstration API passed all eleven fixed synthetic checks through HireLens's execution adapter: five language successes, three compilation failures, a runtime error, a time limit and a wrong-answer result. The command used temporary process settings only. It did not change `.env`, send candidate code, or establish a private execution service.

The [official IDE source](https://github.com/judge0/ide/blob/master/js/ide.js) uses this endpoint without an API key. Its [terms](https://github.com/judge0/ide/blob/master/TERMS.md) provide the service as available and allow access to be terminated; its [privacy policy](https://github.com/judge0/ide/blob/master/PRIVACY.md) says submitted source code is stored. This successful diagnostic is evidence of current compatibility, not a production availability guarantee or a private candidate-data agreement. Use an authenticated provider or a dedicated execution host for real recruitment. The public demonstration endpoint is not enabled automatically by the setup helper.

### Public runner for local personal practice

The user has approved enabling the official public runner for local practice with a clear notice. Set `JUDGE0_URL=https://ce.judge0.com`, leave `JUDGE0_API_KEY` and `JUDGE0_RAPIDAPI_HOST` empty, and restart the API. This is separate from `code:local`, which prepares a dedicated executor. The application identifies the official `ce.judge0.com` and `extra-ce.judge0.com` hosts as public demonstration services and labels the integration **Public practice only**.

This mode works only outside production, with the API bound to a loopback address and the application origin on `localhost`, a `.localhost` subdomain, or a loopback IP. Only candidate-owned personal practice with no company/application association can execute through the interview API. Human and AI hiring assessments are rejected on the server before any source is sent, even if a client supplies a practice context. Production execution is also refused. These restrictions do not affect a separately configured authenticated or self-hosted executor.

Before **Run code** or **Submit solution**, the practice editor explains that source code, standard input and test inputs are uploaded to the public service and that submitted code may be stored. Use synthetic/sample code for this local practice mode. Draft editing remains available when execution is disabled. Hosted result polling preserves each submission's `X-Judge0-Region` affinity without carrying it over to subsequent submissions.

## Local service on a compatible Linux Docker host

```sh
npm run code:prepare
npm run code:local
```

`code:prepare` generates private random database, Redis and API secrets under `.data/judge0/judge0.conf`. It does not change `.env` or start containers. Keep this ignored directory private.

`code:local` checks the Docker engine, starts the separate stack in `deploy/compose.judge0.yaml`, then compiles/runs small diagnostic programs in Python, JavaScript, Java, C and C++. Only after all checks pass does it set the four Judge0 variables in `.env`. Restart HireLens after success. If a different provider URL already exists, the helper refuses to overwrite it.

All five languages are available in practice, AI and human interview editors, per-language saved drafts, and the company coding question library. C and C++ use `c` and `cpp` keys respectively. Existing questions receive editable C/C++ starter programs without rewriting historical snapshots. The server asks the connected Judge0 service for its active language IDs; it never assumes one provider's compiler IDs apply to another. A missing compiler disables execution for that language while draft editing remains available. Monaco registers both C and C++ syntax highlighting.

The Judge0 API binds only to `127.0.0.1:2358`, requires an API token, and disables submitted-program networking, callbacks, compiler options and additional files. Database/Redis ports are private. The official Judge0 sandbox uses privileged containers: use a dedicated compatible execution VM/host for real candidate code. Do not mount project files or the Docker socket into those containers. The first Judge0 image download is large.

On Windows, resolve the Docker Desktop startup failure first, then check engine compatibility. A dedicated compatible Linux VM or a hosted Judge0 endpoint can avoid changing the computer's WSL kernel configuration. The project does not automatically reset Docker or restart WSL.

## Hosted Judge0 or a separate execution server

Set the values supplied by your provider in the project `.env`:

```dotenv
JUDGE0_URL=https://YOUR_JUDGE0_HOST
JUDGE0_API_KEY=YOUR_SECRET
JUDGE0_AUTH_HEADER=X-Auth-Token
JUDGE0_RAPIDAPI_HOST=
```

For a RapidAPI endpoint, use its supplied base URL and host, and `JUDGE0_AUTH_HEADER=X-RapidAPI-Key`. Keep the API key on the server and out of chat. For an execution service on another host, configure authenticated HTTPS/private connectivity; do not expose the loopback development stack directly to the internet.

Then run:

```sh
npm run code:check
```

This submits eleven small diagnostic programs, not candidate data: Python, JavaScript, Java, C and C++ success cases; Java, C and C++ compilation failures; Python runtime failure; a bounded Python timeout; and a wrong-answer verdict. The local setup only connects the endpoint after every check passes. A successful language-list request alone does not count as working code execution. Resolve worker, compiler or sandbox failures before enabling the service. Restart `npm run dev` after updating `.env`, reopen a live interview/practice session, and try **Run code**, then **Submit solution**. Those actions remain unavailable for completed sessions.

Sources: [Judge0 CE 1.13.1 deployment](https://github.com/judge0/judge0/releases/tag/v1.13.1), [official Compose configuration](https://github.com/judge0/judge0/blob/v1.13.1/docker-compose.yml), [Judge0 API and authentication](https://ce.judge0.com/).

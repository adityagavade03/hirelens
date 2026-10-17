# TURN relay setup and verification

The application supplies expiring TURN credentials from the server. The default HMAC mode derives per-user credentials; optional Twilio mode requests temporary credentials from the provider. Long-lived shared secrets and API keys never go to browsers. A running listener or configured URL alone does not establish that relay traffic works.

## Local Windows test relay

This machine now has Coturn 4.18.0 built from its official, checksum-pinned source in `.data/turn/runtime`, using Ubuntu-24.04 WSL. No Docker reset, firewall change, public tunnel or Windows security change is needed. The relay is restricted to allocations on its own private WSL address, uses temporary authenticated credentials and quotas, and drops privileges to the Linux `nobody` account. It is for same-computer verification only.

Run `npm run turn:local`, then restart the API. `npm run local:start` also restarts this relay when HMAC mode is selected and `TURN_LOCAL_DEV=true`. It skips managed providers even if a stale local flag remains; directly invoking the local helper with a managed provider selected fails without starting or changing anything. The helper updates its private WSL address in `.env` after a WSL restart and refuses to overwrite an existing non-local endpoint. Existing listeners with different configuration are left untouched.

The browser shows **A local test relay is configured**. In an interview's Connection checks, click **Test relay connection**. This forces two peers through TURN, exchanges real data, and closes the temporary peers. This check passed in the browser on 8 October 2026. It does not prove cross-network camera or audio playback. Local development relay configuration is rejected in production.

To reproduce the build in an existing Ubuntu-24.04 WSL installation, install `build-essential`, `pkg-config`, `libssl-dev`, `libevent-dev`, `ca-certificates` and `curl`, then run `sh scripts/build-local-turn.sh` inside WSL from the project. The script verifies the archive hash before compiling and does not install a system service. `.data/turn/secret` and `.env` contain private secrets; keep them ignored and never share them.

## Public interviews

A public relay needs a reachable server or a managed provider account. This project does not supply either. A URL in configuration is not proof of a reachable relay. The local WSL relay and `.env` remain unchanged until you explicitly connect a provider.

HireLens supports `TURN_PROVIDER=hmac` (the default, compatible with Coturn) and `TURN_PROVIDER=twilio` (Twilio Network Traversal Service). Static account passwords and provider API keys are not interchangeable with a TURN REST secret. Other providers with their own credential API need a separate integration.

### Managed Twilio relay

An existing Twilio account can supply both the application's SMS service and a public TURN relay; SMS sender configuration is separate and is not required for TURN. Enable Network Traversal Service in your own account and review its eligibility and usage charges before activation. No account is created, service enabled or payment made by configuring the application.

Create a server API key with permission to request Network Traversal tokens. Add the following values privately on the HireLens API host, using the account's real values:

```dotenv
TURN_PROVIDER=twilio
TURN_LOCAL_DEV=false
TURN_TTL_SECONDS=3600
TWILIO_ACCOUNT_SID=YOUR_ACCOUNT_SID
TWILIO_API_KEY_SID=YOUR_API_KEY_SID
TWILIO_API_KEY_SECRET=YOUR_PRIVATE_API_KEY_SECRET
```

These Twilio variables can be shared with the SMS configuration. For development only, an account Auth Token in `TWILIO_AUTH_TOKEN` can replace the API key pair; omit both API-key variables in that case. Production requires the API key pair. Keep credentials out of source control and browser code.

Restart the API, then run `npm run doctor` for redacted configuration checks. This command does not issue provider tokens. When an authorized interview participant joins or explicitly runs the relay check, HireLens requests a short-lived token from the fixed Twilio HTTPS endpoint. Requests have an eight-second timeout, bounded responses and the existing per-user provider rate limit. The browser receives only validated STUN/TURN URLs and temporary credentials. Provider errors do not expose keys or raw responses. In Twilio mode, `TURN_URL` and `TURN_SECRET` are not used, so a saved local relay secret does not become a provider credential.

The implementation requests the configured lifetime, bounded to 60–86,400 seconds, and accepts only the documented Twilio STUN/TURN hostname families. Successful mocked adapter tests establish request/validation behavior, not real account access or media delivery. Run the room's relay probe and the two-network checks below after supplying real credentials. Do not replace `turn:` with `turns:` in a returned provider URL: a port number alone does not establish TLS support.

Twilio's [Network Traversal token documentation](https://www.twilio.com/docs/stun-turn/api) describes its temporary credential API; its [WebRTC integration guide](https://www.twilio.com/docs/stun-turn) requires creating tokens on the server.

### Prepare a public Coturn host

1. Select a Linux host with a reachable public IPv4 address and a domain you control, such as your own `turn` subdomain. Point DNS directly to the relay; an ordinary HTTP reverse proxy cannot forward TURN traffic. Install and maintain Coturn 4.18.0 or review the template against your installed version.
2. Obtain a trusted TLS certificate for the relay domain and arrange renewal. Run Coturn as a dedicated service account with access only to its configuration, required keys and runtime files. Keep configuration readable only by the administrator and that account.
3. Copy `deploy/turnserver.conf.example` to that host's Coturn configuration path. Replace every `REPLACE_` value and `turn.example.com`. Set `listening-ip` and `relay-ip` to the host's actual interface IPv4 address. Behind 1:1 NAT, use `external-ip=PUBLIC_IP/INTERFACE_IP`; when the public address is directly assigned, omit `external-ip`. NAT must preserve relay port numbers.
4. Generate a long random shared secret on that host, place it privately in `static-auth-secret`, and put the identical value in HireLens `TURN_SECRET`. Do not pass the secret as a command-line argument, commit it, or send it in chat. Keep host clocks synchronized because credentials expire.
5. Keep the template's peer restrictions and quotas. It blocks private, loopback, link-local, shared-address, multicast and selected non-public ranges. Link-local and IPv6 private ranges include common metadata destinations; add any other internal or metadata destinations specific to your host. Do not add a broad `allowed-peer-ip`: it overrides a denial. The WSL helper's private-address exception is deliberately absent from this template.
6. Apply the following network rules on the chosen public host and its cloud firewall. This guide does not change the laptop's firewall or publish its services.

| Incoming traffic | Purpose                     |
| ---------------- | --------------------------- |
| UDP and TCP 3478 | TURN client connections     |
| TCP 5349         | TURN over TLS               |
| UDP 49160–49200  | Allocated media relay ports |

Allow the corresponding return/outgoing UDP media traffic under the host's network policy. The template uses UDP relays, including for clients connected over TCP/TLS; it does not need TCP relay ports or UDP 5349. Keep administrative interfaces private. The default 20 allocations and 41 relay ports are for a small pilot; measure usage before raising the port range, quotas or bandwidth budget together. Allocation quotas are not a count of supported interviews.

Start the service and inspect its startup logs for unknown settings, failed binds, missing certificates and authentication errors. A successful process start is only the first check. A missing certificate can leave other transports available, so explicitly verify the TLS endpoint as well:

```sh
openssl s_client -connect YOUR_REAL_TURN_DOMAIN:5349 -servername YOUR_REAL_TURN_DOMAIN -verify_hostname YOUR_REAL_TURN_DOMAIN -verify_return_error </dev/null
```

Use the real hostname in all three places. This checks TLS identity/connectivity, not TURN allocation or media delivery. Certificate renewal must be followed by the service reload/restart required by your host setup.

### Connect HireLens

Set these values privately on the API host, replacing the domain and secret with the real deployment values:

```dotenv
TURN_PROVIDER=hmac
TURN_URL=turn:YOUR_REAL_TURN_DOMAIN:3478?transport=udp,turn:YOUR_REAL_TURN_DOMAIN:3478?transport=tcp,turns:YOUR_REAL_TURN_DOMAIN:5349?transport=tcp
TURN_SECRET=YOUR_MATCHING_PRIVATE_SHARED_SECRET
TURN_TTL_SECONDS=3600
TURN_LOCAL_DEV=false
```

Restart the HireLens API after changing these variables. Serve the application and authenticated Socket.IO connection over HTTPS/WSS, with the deployed origin configured correctly. Do not expose the development Vite server as the public application. `localhost` only reaches the device on which it is opened; adding TURN does not publish HireLens itself.

### Verify two networks

Open the deployed HTTPS app on two devices using different internet connections, for example Wi-Fi and mobile data. Each participant must explicitly allow their own devices. Verify:

1. The relay check passes on both devices. It exchanges data between temporary relay-only peers without using the camera or microphone. For self-hosted HMAC mode, check UDP, TCP and TLS URLs separately by selecting one `TURN_URL` at a time on a test deployment, restarting the API and repeating the check. A pass with several URLs configured does not prove every transport works. Twilio mode uses the provider's returned URL list; its transport coverage must be verified separately on the target networks.
2. Candidate joins the waiting room and the assigned interviewer admits them.
3. Both participants can see and hear the other, with received media counters advancing.
4. Screen sharing starts and stops correctly; the selected screen reaches the other browser.
5. Reconnection and device unplug/reselection recover without losing the meeting or saved code.
6. Optional recordings play with sound and transcripts can be reviewed.

Record device/browser versions, network type, selected transport, received media counters and actual two-way audio/video results. Both participants must confirm they heard the other; counters alone cannot do that. A successful same-laptop probe is not a two-device result. Keep the two-network check pending until the public host and a second physical device are available.

If a probe fails, check the certificate hostname/chain, DNS destination, host/NAT port mapping, relay UDP rules, clock synchronization and matching secrets. Authentication failures often indicate the last two. Do not solve a failed check by disabling authentication, allowing private peers, turning off certificate validation or exposing the local WSL relay.

Sources: [official Coturn release](https://github.com/coturn/coturn/releases/tag/4.18.0), [TURN configuration reference](https://github.com/coturn/coturn/blob/4.18.0/examples/etc/turnserver.conf).

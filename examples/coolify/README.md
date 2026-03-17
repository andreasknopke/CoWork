# Coolify deployment example

This example provides a minimal Jitsi Meet stack for Coolify with an integrated coturn relay on the same host:

- `web`
- `turn`
- `prosody`
- `jicofo`
- `jvb`

Files:

- `docker-compose.yml`
- `env.example`

## 1. Prepare environment values

Copy values from `env.example` into Coolify environment variables for the app.

Required values:

- `PUBLIC_URL` (your public HTTPS URL, for example `https://jitsi.example.com`)
- `JICOFO_AUTH_PASSWORD` (long random secret)
- `JVB_AUTH_PASSWORD` (long random secret)
- `JVB_ADVERTISE_IPS` (public IP of the host where JVB runs)
- `TURN_CREDENTIALS` (long random secret for coturn REST auth)
- `TURN_HOST` (hostname that resolves to the same public host)
- `TURN_EXTERNAL_IP` (public IP of the same host)

Useful command to generate strong secrets:

```bash
openssl rand -hex 32
```

## 2. Configure Coolify routing

Recommended mode is TLS termination in Coolify (proxy mode):

- Keep `DISABLE_HTTPS=1`
- Keep `ENABLE_HTTP_REDIRECT=0`
- Route your domain to service `web` on internal port `80`

If you do not use Coolify proxy termination, you can switch to container TLS:

- `DISABLE_HTTPS=0`
- `ENABLE_HTTP_REDIRECT=1`
- Publish `443` from `web` (adjust the compose file accordingly)

## 3. Open media port

Jitsi media requires UDP:

- `10000/udp` must be reachable from the internet to the `jvb` container.
- `3478/tcp` and `3478/udp` must be reachable to the `turn` container.
- `20000-20050/udp` must be reachable to the `turn` container for relayed media.

If you change `JVB_PORT`, open that UDP port instead.
If you change `TURN_PORT` or the relay range, open those values instead.

## 4. Notes

- The first startup takes longer because Prosody and web config are initialized.
- Wrong `JVB_ADVERTISE_IPS` is the most common reason for calls with no audio/video.
- Browser logs containing `get STUN/TURN credentials (extdisco)` with `service-unavailable` mean that Prosody is not advertising any TURN service.
- There is no built-in demo timeout in this stack. If a room dies again after an exact idle window such as `1:17`, the usual culprit is the browser-to-proxy XMPP websocket path or an outer automation layer, not Jitsi licensing.
- Because Coolify commonly sits behind another reverse proxy layer, this example now prefers BOSH over XMPP websocket by default. That is the blunt but reliable way to bypass websocket idle cuts and hidden-iframe timer throttling.
- If you switch back to websocket mode later and a conference or screen share drops again after roughly 60 to 70 seconds with an XMPP websocket close, the example still raises the internal websocket proxy timeouts and the Prosody SMACKS hibernation window by default.

## 5. Local Recovery Workaround

For one specific local installation with a repeatable drop around `70` seconds, this example also supports an intentionally local-only stopgap.

Important deployment detail:

- The web service is now built from [web/Dockerfile](web/Dockerfile) in this repository so local web patches are guaranteed to land in the deployed image.
- In addition, the workaround is also delivered through a mounted [examples/coolify/custom-config.js](examples/coolify/custom-config.js), so the deployment keeps working even if one of the two paths is missed by the platform.
- Net effect: both the built image and the mounted runtime config now carry the same local recovery behavior.

What it does:

- The web client schedules a silent same-room rebuild shortly before the known failure window.
- Internally it uses Jitsi's legacy `APP.conference.leaveRoom(false)` plus `APP.conference.joinRoom(...)` path.
- If the timer misses and the conference fires `connectionInterrupted` first, the client retries after a short grace period.
- If that silent rejoin stalls, the browser reloads once and suppresses prejoin for the recovery load.

Current tuning in [examples/coolify/custom-config.js](examples/coolify/custom-config.js):

- preemptive rejoin after `55` seconds
- interrupt grace of `2.5` seconds
- watchdog timeout of `15` seconds
- minimum gap between recovery attempts of `10` seconds

This is not meant as a portable upstream fix. It is a site-local workaround for a deterministic failure pattern while the real media-path root cause is still under investigation.

## 6. TURN Relay

For users behind restrictive firewalls or NAT, this example includes a coturn relay on the same Coolify host.

Recommended bundled `coturn` setup:

- `TURN_HOST=cowork.example.com`
- `STUN_HOST=cowork.example.com`
- `TURN_EXTERNAL_IP=<same public IP as JVB>`
- `TURN_PORT=3478`
- `TURN_MIN_PORT=20000`
- `TURN_MAX_PORT=20050`
- `TURN_CREDENTIALS=<coturn static-auth-secret>`

You do not need a second VM or a second physical server for this. The `turn` service runs as an additional container on the same host.

You can reuse the same DNS name as `PUBLIC_URL` if it already points to the public host. TURN uses its own ports and is not routed through the HTTP reverse proxy.

For this minimal setup, TLS TURN on port 5349 is intentionally disabled. Leave `TURNS_HOST` empty unless you explicitly add certificates and want TURN over TLS.

If you prefer an external TURN server instead of the bundled container, keep using:

- `TURN_USERNAME=<username>`
- `TURN_PASSWORD=<password>`

These values are consumed by Prosody and exposed to clients through XMPP extdisco.

## 7. Diagnostics

This example now enables more verbose diagnostics by default while investigating unstable media sessions:

- `ENABLE_XMPP_WEBSOCKET=0`
- `PREFER_BOSH=1`
- `PROSODY_LOG_LEVEL=debug`
- `JICOFO_LOG_LEVEL=FINE`
- `JVB_LOG_LEVEL=FINE`
- `JICOFO_LOG_FILE=/config/jicofo.log`
- `JVB_LOG_FILE=/config/jvb.log`
- `XMPP_WEBSOCKET_PROXY_READ_TIMEOUT=3600s`
- `XMPP_WEBSOCKET_PROXY_SEND_TIMEOUT=3600s`
- `COLIBRI_WEBSOCKET_PROXY_READ_TIMEOUT=3600s`
- `COLIBRI_WEBSOCKET_PROXY_SEND_TIMEOUT=3600s`
- `PROSODY_SMACKS_HIBERNATION_TIME=300`
- mounted [examples/coolify/custom-config.js](examples/coolify/custom-config.js) on the affected local deployment only

What to look for:

- If the conference becomes stable with `ENABLE_XMPP_WEBSOCKET=0`, the timer is on the websocket path in front of Jitsi, not in Jicofo or Prosody room logic.
- If it still dies with `ENABLE_XMPP_WEBSOCKET=0`, the timer is outside the XMPP websocket path and we should inspect the host app lifecycle or external automation next.
- Auth or JWT problems usually show up in Prosody or Jicofo as token/authentication errors.
- Media path problems usually show up as repeated ICE restarts in JVB and `restartRequested=true` in Jicofo.
- Connection lifecycle timing for `/http-bind` and `/xmpp-websocket` is now logged by nginx with request duration, upstream duration, and upgrade status.

If you later want to test websocket again, set `ENABLE_XMPP_WEBSOCKET=1` and keep `PREFER_BOSH=1` so the client still prefers BOSH when both paths are available.

If you need even more detail, set additional java.util.logging categories through:

- `JICOFO_EXTRA_LOGGERS`
- `JVB_EXTRA_LOGGERS`

These values are appended directly to the generated `logging.properties` files and can contain multiple lines.

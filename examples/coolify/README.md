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

## 5. TURN Relay

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

If you prefer an external TURN server instead of the bundled container, keep using:

- `TURN_USERNAME=<username>`
- `TURN_PASSWORD=<password>`

These values are consumed by Prosody and exposed to clients through XMPP extdisco.

## 6. Diagnostics

This example now enables more verbose diagnostics by default while investigating unstable media sessions:

- `PROSODY_LOG_LEVEL=debug`
- `JICOFO_LOG_LEVEL=FINE`
- `JVB_LOG_LEVEL=FINE`
- `JICOFO_LOG_FILE=/config/jicofo.log`
- `JVB_LOG_FILE=/config/jvb.log`

What to look for:

- Auth or JWT problems usually show up in Prosody or Jicofo as token/authentication errors.
- Media path problems usually show up as repeated ICE restarts in JVB and `restartRequested=true` in Jicofo.

If you need even more detail, set additional java.util.logging categories through:

- `JICOFO_EXTRA_LOGGERS`
- `JVB_EXTRA_LOGGERS`

These values are appended directly to the generated `logging.properties` files and can contain multiple lines.

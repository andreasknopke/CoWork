# Coolify deployment example

This example provides a minimal 4-service Jitsi Meet stack for Coolify:

- `web`
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

If you change `JVB_PORT`, open that UDP port instead.

## 4. Notes

- The first startup takes longer because Prosody and web config are initialized.
- Wrong `JVB_ADVERTISE_IPS` is the most common reason for calls with no audio/video.
- Browser logs containing `get STUN/TURN credentials (extdisco)` with `service-unavailable` mean that Prosody is not advertising any TURN service.

## 5. TURN Relay

For users behind restrictive firewalls or NAT, configure a TURN server and provide the TURN variables from `env.example`.

Typical `coturn` setup:

- `TURN_HOST=turn.example.com`
- `TURNS_HOST=turn.example.com`
- `TURN_PORT=3478`
- `TURNS_PORT=5349`
- `TURN_TRANSPORT=udp,tcp`
- `TURN_CREDENTIALS=<coturn static-auth-secret>`

If you prefer static credentials instead of a shared secret, use:

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

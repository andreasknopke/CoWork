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

Recommended XMPP setting for Coolify:

- `XMPP_SERVER=prosody`

The example compose file passes `XMPP_SERVER` through to Prosody, Jicofo and JVB. This avoids the previous hardcoded fallback to `xmpp.meet.jitsi`, which could cause Jicofo/JVB to resolve against public DNS instead of the internal container network.

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

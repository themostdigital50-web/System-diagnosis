# Running SystemScope with Docker

The Dockerfile builds the client and server, then runs a single Express process that serves both the dashboard and the API on port `3001`.

## Start

```bash
docker compose up --build -d
```

Open <http://localhost:3001>. Because Compose publishes the port on all host interfaces, the dashboard is also reachable at `http://<your-LAN-IP>:3001`.

```bash
docker compose logs -f     # follow logs
docker compose ps          # show status and health
docker compose down        # stop and remove the container
```

To restrict access to this machine only, change the port mapping in `compose.yaml`:

```yaml
ports:
  - "127.0.0.1:3001:3001"
```

> Publishing on all interfaces means anyone on your local network can open the dashboard and run diagnostics. Do that only on a trusted network, or add a firewall rule.

## What the container reports

In **local mode** (no enrollment), this image reports **container-level** information: the container's hostname, CPU view, memory, network interfaces and filesystem. It does **not** inspect the Windows/macOS host. Windows-specific fields (WMI-friendly OS name, physical core count, GPU driver/VRAM) are unavailable inside Linux containers and are shown as **Unavailable** with a reason — never guessed. For real host data in local mode, run `npm run dev` on the machine itself.

For a deployed dashboard that shows **real per-computer data**, use **fleet mode**: enroll each Windows/Linux computer in the dashboard and run the device agent on it (see the "Fleet mode" section of `README.md`). Fleet reports are stored on the mounted data volume, not read from this container.

Native networking tools (`ping`, `nslookup`, `traceroute`) are installed in the image, and the container is granted `NET_RAW` so ICMP diagnostics work for local mode. HTTP and TCP port checks use Node directly. Device diagnostics run on the device agent, not here.

## Configuration

Set these under `environment:` in `compose.yaml` (or pass `--env-file`):

| Variable | Default in Compose | Meaning |
|---|---|---|
| `HOST` | `0.0.0.0` | Bind address inside the container. Keep this for port mapping to work. |
| `PORT` | `3001` | Listen/port-map value. |
| `NODE_ENV` | `production` | Runtime mode. |
| `METRICS_INTERVAL_MS` | `2000` | Sampling interval (1000–60000 ms). |
| `PUBLIC_IP_ENABLED` | `true` | Set to `false` to stop the external ipify lookup. |
| `PUBLIC_IP_URL` | ipify URL | Public IP provider. |
| `SPEEDTEST_MAX_BYTES` | `52428800` | Per-test byte ceiling (1–100 MB). |
| `DATA_DIR` | `/data` | Writable directory for `fleet.json`; mounted as the `systemscope-data` volume. |
| `VIEWER_TOKEN` | empty | Dashboard password for fleet data. Set this on any public deployment. |
| `AGENT_ENROLLMENT_TOKEN` | empty | Secret for scripted enrollment (`POST /api/agent/enroll`). |
| `DEVICE_STALE_MS` | `90000` | Last-report age before a device is marked stale. |
| `DEVICE_COMMAND_TTL_MS` | `60000` | Lifetime of a queued diagnostic. |

Compose mounts a named `systemscope-data` volume at `/data`, so device reports survive container recreation. The `/data` directory is created as the unprivileged `node` user in the image. If the volume is not writable, the dashboard displays a persistent-storage warning and reports last only for the current session.

No `.env` file is copied into the image. Interface preferences live in the browser; agent settings changed in the UI are held in memory. Fleet reports are the exception: they are written to `/data/fleet.json` with `0600` permissions.

## Health check

Compose probes `http://127.0.0.1:3001/api/health` every 15 seconds with Node's built-in `fetch`:

```bash
curl http://localhost:3001/api/health
# {"ok":true,"data":{"status":"ok",...}}
```

## Build / validate manually

```bash
docker compose config
docker build -t systemscope:local .
docker run --rm -p 3001:3001 -e HOST=0.0.0.0 systemscope:local
```

The image is a multi-stage build: dependency install, compile/typecheck, then a minimal Alpine runtime with production dependencies and compiled output only. It runs as the unprivileged `node` user with a read-only root filesystem, dropped capabilities, and no new privileges.

Both install stages use `npm install --no-package-lock` because the committed lockfile was generated on Windows and contains only Windows Rollup/esbuild binaries. A fresh install resolves the correct Linux binaries inside the image; CI uses the same command so pushes build reliably on `ubuntu-latest`.

Static assets are gzip-compressed and hashed assets are served with long-lived immutable caching. The service worker is registered only in production and caches the app shell, never `/api/*` responses. Browser installation requires localhost or HTTPS; a plain-HTTP LAN address remains usable but is not installable.

## Privacy

The only external calls are the public-IP lookup (enabled by default, disable in `compose.yaml` or Settings) and speed tests, which only run when you click them in the dashboard. Fleet reports received from enrolled device agents are written to `/data/fleet.json` so they survive restarts; local-mode metric history stays in memory.

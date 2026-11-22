# SystemScope

A dark-themed dashboard for inspecting a computer's hardware, operating system, network configuration, connectivity, and live performance.

A web page cannot read the real OS, CPU, RAM, disks, or interfaces of the device viewing it. That is a browser security rule, not a setting. SystemScope therefore works in two honest modes:

- **Local mode** — a small Node.js agent runs on the same machine as the dashboard and reports that machine's data over a localhost REST API.
- **Fleet mode** — the dashboard is deployed publicly (e.g. on Render) and a **device agent** runs on each Windows/Linux computer you want to monitor. Each agent reads its own machine and posts reports over HTTPS. The dashboard shows exactly what those agents send — never the server's container.

Phones, tablets, and macOS are not supported as monitored devices. Unsupported browsers get a clear message instead of misleading data.

## Quick start (local mode)

Requires **Node.js 20 or newer** (developed on Node 24 / Windows 11).

```bash
npm install
npm run dev
```

- Dashboard: <http://localhost:5173>
- Local agent: <http://127.0.0.1:3001>
- Health check: <http://127.0.0.1:3001/api/health>

Production build:

```bash
npm run build
npm start
```

The built dashboard is then served by the same Express process at <http://127.0.0.1:3001>.

### Docker

```bash
docker compose up --build -d
```

Dashboard: <http://localhost:3001>. See `README.Docker.md` for configuration, health checks, and the important caveat that a Linux container reports container-level data rather than the Windows host.

## Fleet mode (per-computer reporting)

Use this when the dashboard is hosted publicly and you want to see your own computers, not the server.

### 1. Deploy the dashboard

A `render.yaml` blueprint is included. On Render:

1. Create a Web Service from this repository using the blueprint (runtime `docker`, plan **starter** or higher — Persistent Disk is required).
2. Set secret environment variables in the Render dashboard:
   - `VIEWER_TOKEN` — the password viewers enter to unlock device data.
   - `AGENT_ENROLLMENT_TOKEN` — a secret for scripted enrollment (optional; dashboard enrollment works without it).
3. Confirm the disk is mounted at `/data` (the blueprint configures `DATA_DIR=/data` and a 1 GB Persistent Disk). Without a writable disk, reports survive only until the next restart and the dashboard warns you.

Render serves HTTPS automatically, which the device agent requires for remote servers.

Local Docker works too — set the same variables in `compose.yaml` or an env file. The Compose file already mounts a named `systemscope-data` volume at `/data`.

### 2. Enroll a computer

Open the dashboard, sign in with `VIEWER_TOKEN`, and go to **Devices → Add a computer**. Give it a name and click **Enroll computer**. You will be shown a **device ID** and a **one-time token** — copy the generated setup command immediately. Only a SHA-256 hash of the token is stored on the server; the token cannot be recovered later. If it is lost, delete the device and enroll it again.

### 3. Install the agent on that computer

Run the generated setup command in the project folder on the Windows or Linux computer itself. It saves the config to `%APPDATA%\SystemScopeAgent\config.json` (Windows) or `~/.config/systemscope-agent/config.json` (Linux).

To also register automatic startup at logon:

**Windows (PowerShell, in the project folder):**

```powershell
.\scripts\install-agent.ps1 -ServerUrl https://your-app.onrender.com -DeviceId "<id>" -DeviceToken "<token>" -Label "Office PC"
```

This builds the agent, saves the token, and creates a `SystemScopeAgent` scheduled task that starts at logon.

**Linux:**

```bash
./scripts/install-agent.sh \
  --server-url https://your-app.onrender.com \
  --device-id "<id>" \
  --device-token "<token>" \
  --label "Office PC"
```

This builds the agent, saves the token, and installs a `systemscope-agent.service` systemd user service enabled at login. Check it with `systemctl --user status systemscope-agent`.

To run manually without installing a service:

```bash
node server/dist/agent/index.js setup <server-url> <device-id> <device-token> "Office PC"
node server/dist/agent/index.js run        # or: once  (single report, for testing)
node server/dist/agent/index.js status     # show saved config
```

The agent reports every 30 seconds by default (configurable in the saved `config.json`), retries with exponential backoff, and never accepts a plain-HTTP remote URL (localhost is allowed for testing).

### 4. View the computer

The computer appears in **Devices** as `online` while its reports are fresh. Open it to see real system, network, performance, and diagnostic data collected **on that computer**. Diagnostics and speed tests are queued and executed by the agent locally; results return to the dashboard. Only an allowlisted set of tools can be queued — no arbitrary commands.

## What it shows

| Page | Contents |
|---|---|
| Devices | Enrolled computers, online/stale/offline status, last report time, enrollment |
| Overview | Live CPU / memory / disk / network cards, uptime, OS and network summary, quick latency probe, sparklines |
| System | OS name/version/build, hostname, CPU model and topology, memory, storage devices, GPU, browser-reported values in a separate section |
| Network | Local IPv4/IPv6, MAC, gateway, DNS, active interface, connection type, public IP, internet state, interface table, external speed test |
| Diagnostics | Ping, latency, DNS lookup, traceroute, HTTP check, TCP port check — structured results plus raw output |
| Performance | Lightweight dependency-free SVG charts for CPU, memory, disk and network throughput with configurable window and pause control |
| Settings | Interface preferences (localStorage) and agent settings (sampling, timeouts, public-IP opt-out) |

## Architecture

```
client/   React 19 + TypeScript + Vite + Tailwind CSS v4 + dependency-free SVG charts
server/   Node.js + Express + TypeScript (tsx in dev, compiled JS in production)
```

- `server/src/services/systemInfo.ts` — OS, CPU, memory and storage (`os`, `fs.statfs`)
- `server/src/services/platform.ts` — platform-specific adapters for Windows / Linux / macOS (PowerShell, `/proc`, `sysctl`)
- `server/src/services/networkInfo.ts` — interfaces, gateway, DNS, connection type via `os.networkInterfaces()` and OS tools
- `server/src/services/metrics.ts` — sampled metric ring buffer with CPU deltas and network byte counters
- `server/src/services/diagnostics/` — native-command probes and Node-based HTTP/port checks
- `server/src/services/publicIp.ts` — optional external IP lookup with caching
- `server/src/services/fleetStore.ts` — atomic, disk-persisted device registry, latest reports, bounded history, command queue
- `server/src/agent/index.ts` — device agent CLI (setup / run / once / status) using the same collectors and diagnostics
- `server/src/routes/agent.ts`, `server/src/routes/fleet.ts` — authenticated agent ingest and viewer device API
- `client/src/lib/api.ts` — typed REST client, viewer token, device scoping, routed diagnostics
- `client/src/components/ui.tsx` — cards, unavailable-value rendering, badges, form controls

### API

Local mode endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Agent status |
| GET | `/api/system/info` | System information |
| GET | `/api/network/info` | Network information |
| GET | `/api/metrics/snapshot?window=` | Latest sample + history |
| GET | `/api/metrics/history?window=` | History only |
| POST | `/api/diagnostics/ping` \| `/latency` \| `/dns` \| `/traceroute` \| `/http` \| `/port` | Local diagnostic |
| POST | `/api/speedtest/download` \| `/api/speedtest/upload` | External throughput test |
| GET / PUT | `/api/settings` | Agent settings |

Fleet mode endpoints:

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/fleet/config` | public | Whether login/enrollment are required and storage is writable |
| GET | `/api/fleet/verify` | viewer token | Check a viewer password |
| GET / POST | `/api/devices` | viewer token | List / enroll computers |
| GET / PATCH / DELETE | `/api/devices/:id` | viewer token | Summary, rename, remove |
| GET | `/api/devices/:id/health` \| `/system/info` \| `/network/info` \| `/metrics/snapshot` \| `/settings` | viewer token | Stored device report |
| POST | `/api/devices/:id/commands` | viewer token | Queue an allowlisted diagnostic |
| GET | `/api/devices/:id/commands/:commandId` | viewer token | poll command status/result |
| POST | `/api/agent/enroll` | enrollment token | Scripted enrollment |
| POST | `/api/agent/report` | device token | Submit a device report |
| GET | `/api/agent/commands` | device token | Pick up queued commands |
| POST | `/api/agent/command/result` | device token | Return a command result |

## Data honesty

Every uncertain value is returned as a `Field<T>` with `value`, `status`, `source`, and an optional `reason`. When the operating system does not expose something, the UI prints **Unavailable** with the reason. It never substitutes zeros, cached guesses, or sample data.

- CPU usage is derived from changes in `os.cpus()` timing counters — the first sample is `null`, not `0%`.
- Memory values are OS estimates reported by Node; the UI says so.
- GPU and physical-core data come from platform APIs. If they are missing, they stay unavailable.
- Browser-observable values (`navigator`, screen, `navigator.onLine`) are shown in clearly labeled "browser-reported" sections and are never used as OS-level data.
- Latency and packet loss only come from completed probe runs, with raw sent/received counts.
- In fleet mode, a device with no report yet shows "Awaiting first report" — never the server's container data.

## Security and privacy

- Viewer access is gated by `VIEWER_TOKEN` (compared as hashes). The token is kept in the browser tab's `sessionStorage` only.
- Each enrolled computer gets its own random token; only its SHA-256 hash is stored. Revoking a device deletes its reports and token.
- Scripted enrollment requires `AGENT_ENROLLMENT_TOKEN` when set; dashboard enrollment always requires the viewer password.
- Device reports are validated and bounded before being written. Commands are allowlisted and carry parameters validated with the same Zod schemas as local diagnostics. No arbitrary shell commands.
- Local mode binds to `127.0.0.1` and accepts same-origin requests. Docker publishes port `3001` on all interfaces; use a trusted network or a firewall. Device agents must use HTTPS for remote servers.
- Diagnostic input is validated with Zod: hostnames/IPs, ports, URL schemes, counts, hops and timeouts are all bounded. Native tools run via `spawn` with an argv array and `shell: false`.
- At most two diagnostics run concurrently; a speed test is single-instance. Both reject extra requests instead of queueing unbounded work.
- Fleet reports are written to `DATA_DIR/fleet.json` with atomic replacement and `0600` permissions **so they survive restarts**. Local-mode metric history remains in memory only. If the data directory is read-only, the dashboard shows a persistent-storage warning.
- The only external network calls are the public-IP lookup (enabled by default, disable in Settings) and user-started speed tests via Cloudflare.

## Configuration

Copy `.env.example` to `.env` to change startup defaults:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3001` | Local agent port |
| `METRICS_INTERVAL_MS` | `2000` | Metric sampling interval (1000–60000) |
| `PUBLIC_IP_ENABLED` | `true` | Set to `false` to disable the external lookup |
| `PUBLIC_IP_URL` | `https://api.ipify.org?format=json` | Public IP provider |
| `SPEEDTEST_MAX_BYTES` | `52428800` | Maximum bytes per speed test |
| `DATA_DIR` | `./data` | Writable directory for `fleet.json` |
| `VIEWER_TOKEN` | empty | Dashboard password; empty disables auth (local only) |
| `AGENT_ENROLLMENT_TOKEN` | empty | Secret for `/api/agent/enroll`; empty disables scripted enrollment |
| `DEVICE_STALE_MS` | `90000` | Age after the last report before a device becomes stale |
| `DEVICE_COMMAND_TTL_MS` | `60000` | Time a queued command waits for the agent |

Runtime changes made in Settings are applied immediately; environment variables only set the startup defaults.

## Fast delivery and runtime

- Server responses and static assets are gzip-compressed. Hashed `/assets/*` files are cached with `max-age=31536000, immutable`; `index.html` stays `no-cache`.
- System and network info are coalesced and cached briefly (`5 s` / `15 s`), so overlapping polls never repeat expensive OS or external lookups.
- The client deduplicates in-flight requests, aborts abandoned ones, pauses polling in background tabs, backs off on errors, and stretches intervals on slow/save-data connections.
- Charts are small hand-written SVG components with downsampling and no animation, so the default page no longer ships a large charting library.

## Installable app (PWA)

The production build includes a web manifest, icons and a small service worker. On **localhost or HTTPS**, use your browser's "Install app" action to add SystemScope to the home screen with an offline app shell. API responses are never cached by the service worker. On a plain-HTTP LAN address, the responsive dashboard still works, but browsers will not offer installation without HTTPS.

## Dependency strategy

`package-lock.json` is kept for local development, but CI and Docker intentionally run `npm install --no-package-lock`. The committed lockfile was generated on Windows and contains only Windows native binaries for Rollup/esbuild, which breaks `npm ci` on Linux runners (npm/cli#4828). A fresh lockfile-free install resolves the correct platform binaries everywhere.

## Platform notes

- **Windows**: one batched `Get-CimInstance` call supplies friendly OS name, physical cores and GPU; `ipconfig /all` supplies gateway, DNS and adapter details; `netstat -e` supplies network byte counters; `ping` / `tracert` / `nslookup` handle diagnostics. Slow WMI facts are collected once and cached.
- **Linux**: `/etc/os-release`, `/proc/cpuinfo`, `/proc/net/route`, `/etc/resolv.conf`, `/proc/net/dev`, `lspci` / `nvidia-smi`.
- **macOS**: `sw_vers`, `sysctl`, `route`, `scutil`, `system_profiler`, `netstat -ib` — supported by the local collectors, but macOS is **not** a supported fleet device.

Some fields can be unavailable on any platform depending on permissions and installed tools. That is expected and handled explicitly.

## Scripts

```bash
npm run typecheck   # check both workspaces
npm run build       # compile server + build client
npm start           # serve the production build locally
```

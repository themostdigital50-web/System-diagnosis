import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { asyncRoute, notFound, errorHandler } from './lib/errors';
import { sendData } from './lib/http';
import { startSampler, stopSampler } from './services/metrics';
import systemRouter from './routes/system';
import networkRouter from './routes/network';
import metricsRouter from './routes/metrics';
import diagnosticsRouter from './routes/diagnostics';
import speedtestRouter from './routes/speedtest';
import settingsRouter from './routes/settings';

const app = express();
app.disable('x-powered-by');

/**
 * The dashboard is served by this process, so its requests are same-origin.
 * A browser also sends Origin on same-origin POST/PUT, so we must accept the
 * exact host the user typed (including a LAN IP when the port is published on
 * all interfaces). Everything else is denied by simply omitting CORS headers.
 */
function isSameOrigin(origin: string, host: string | undefined): boolean {
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed =
    !origin || config.clientOrigins.includes(origin) || isSameOrigin(origin, req.headers.host);

  if (allowed && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

app.use(express.json({ limit: '32kb' }));

app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.get('/api/health', (_req, res) => {
  sendData(res, {
    status: 'ok',
    service: 'SystemScope local agent',
    platform: process.platform,
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

app.use('/api/system', systemRouter);
app.use('/api/network', networkRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/diagnostics', diagnosticsRouter);
app.use('/api/speedtest', speedtestRouter);
app.use('/api/settings', settingsRouter);

app.use('/api', (_req, _res, next) => next(notFound('Unknown API endpoint')));

if (fs.existsSync(config.clientDist)) {
  app.use(express.static(config.clientDist, { index: false }));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(config.clientDist, 'index.html'));
  });
} else {
  app.get(
    '/',
    asyncRoute(async (_req, res) => {
      sendData(res, {
        message: 'SystemScope API is running. Start the Vite dev server for the dashboard.',
        endpoints: ['/api/health', '/api/system/info', '/api/network/info', '/api/metrics/snapshot'],
      });
    }),
  );
}

app.use(errorHandler);

const server = app.listen(config.port, config.host, () => {
  console.log(`[SystemScope] Local agent listening on http://${config.host}:${config.port}`);
  startSampler();
});

function shutdown(): void {
  stopSampler();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

import net from 'node:net';
import type { PortResult } from '../../types';

export async function checkPort(host: string, port: number, timeoutMs: number): Promise<PortResult> {
  const started = performance.now();

  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (state: PortResult['state'], error: string | null = null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        host,
        port,
        state,
        connectMs: state === 'open' ? Math.round(performance.now() - started) : null,
        error,
      });
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish('open'));
    socket.once('timeout', () => finish('timeout', `No response within ${timeoutMs} ms`));
    socket.once('error', (error: NodeJS.ErrnoException) => {
      finish(error.code === 'ECONNREFUSED' || error.code === 'ENETUNREACH' || error.code === 'EHOSTUNREACH' ? 'closed' : 'error', error.message);
    });
  });
}

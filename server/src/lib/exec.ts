import { spawn } from 'node:child_process';
import { config } from '../config';

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

/**
 * Runs a native utility with an argv array. `shell` is never enabled, so user
 * input cannot be interpreted as a command. Output is capped to avoid a
 * runaway process filling memory.
 */
export function runCommand(
  command: string,
  args: string[],
  timeoutMs = config.processTimeoutMs,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout: stdout.trimEnd(), stderr: stderr.trimEnd(), exitCode, timedOut });
    };

    const append = (current: string, chunk: Buffer): string => {
      const remaining = config.maxOutputBytes - current.length;
      return remaining > 0 ? current + chunk.toString('utf8').slice(0, remaining) : current;
    };

    child.stdout.on('data', (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.on('error', (error) => {
      stderr = stderr || error.message;
      finish(null);
    });
    child.on('close', (code) => finish(code));

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
      finish(null);
    }, timeoutMs);
  });
}

/** PowerShell scripts used here are static internal strings, never user input. */
async function executePowerShell<T>(script: string, timeoutMs: number): Promise<T | null> {
  const result = await runCommand('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `${script} | ConvertTo-Json -Compress -Depth 4`,
  ], timeoutMs);

  if (result.exitCode !== 0 || !result.stdout.trim()) return null;
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    return null;
  }
}

/**
 * PowerShell startup is expensive and concurrent instances contend on this
 * machine, so all scripts are executed through one serial queue.
 */
let powerShellQueue: Promise<unknown> = Promise.resolve();

export function powerShellJson<T>(script: string, timeoutMs = 12_000): Promise<T | null> {
  const run = powerShellQueue.then(
    () => executePowerShell<T>(script, timeoutMs),
    () => executePowerShell<T>(script, timeoutMs),
  );
  powerShellQueue = run.catch(() => undefined);
  return run;
}

export function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    const fs = await import('node:fs/promises');
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

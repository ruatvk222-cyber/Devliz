import { appendFileSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

/**
 * Per-launch debug log. Captures the spawn args, chrome path, env, exit code,
 * and stderr so users can hand us a single file when something looks wrong
 * (extension not loading, immediate exit, proxy failure, etc.). Logs are
 * truncated to keep at most 20 most-recent runs.
 */

const MAX_LOG_FILES = 20;

export function logsDir(): string {
  const dir = join(app.getPath('userData'), 'logs');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function pruneOld(): void {
  try {
    const dir = logsDir();
    const entries = readdirSync(dir)
      .filter((f) => f.startsWith('launch-') && f.endsWith('.log'))
      .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const stale of entries.slice(MAX_LOG_FILES)) {
      try {
        unlinkSync(join(dir, stale.f));
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

export interface LaunchLogger {
  path: string;
  write(message: string): void;
  writeKv(key: string, value: unknown): void;
  flushSection(title: string, body: string): void;
}

export function startLaunchLog(profileId: string): LaunchLogger {
  pruneOld();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = join(logsDir(), `launch-${stamp}-${profileId}.log`);
  const write = (msg: string): void => {
    try {
      appendFileSync(path, msg.endsWith('\n') ? msg : `${msg}\n`);
    } catch {
      /* ignore */
    }
  };
  write(`# Devliz launch log`);
  write(`# profile=${profileId}`);
  write(`# time=${new Date().toISOString()}`);
  write(`# platform=${process.platform} arch=${process.arch}`);
  return {
    path,
    write,
    writeKv: (key, value) => write(`${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`),
    flushSection: (title, body) => write(`\n--- ${title} ---\n${body}`),
  };
}

export function listLaunchLogs(): { name: string; path: string; mtime: number; size: number }[] {
  try {
    const dir = logsDir();
    return readdirSync(dir)
      .filter((f) => f.startsWith('launch-') && f.endsWith('.log'))
      .map((f) => {
        const path = join(dir, f);
        const s = statSync(path);
        return { name: f, path, mtime: s.mtimeMs, size: s.size };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

export function readLaunchLog(name: string): string | null {
  try {
    const dir = logsDir();
    if (name.includes('/') || name.includes('\\')) return null;
    return readFileSync(join(dir, name), 'utf8');
  } catch {
    return null;
  }
}

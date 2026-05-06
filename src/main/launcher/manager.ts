import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import type { LauncherStatus, ProfileStatus, ProxyConfig } from '@shared/types';
import { getProfile, setProfileStatus } from '../repositories/profiles';
import { getProxy } from '../repositories/proxies';
import { getSettings } from '../repositories/settings';
import { detectChromePath } from './chrome-path';
import { writeFingerprintExtension } from './extension';

interface RunningProfile {
  pid: number;
  child: ChildProcess;
  remoteDebugPort: number;
}

const running = new Map<string, RunningProfile>();
const launcherEvents = new EventEmitter();
let nextDebugPort = 9333;

export function onLauncherStatus(cb: (s: LauncherStatus) => void): () => void {
  launcherEvents.on('status', cb);
  return () => launcherEvents.off('status', cb);
}

function emit(status: LauncherStatus): void {
  launcherEvents.emit('status', status);
}

function pickPort(): number {
  // 9333..29999 should be safe; not strictly checked for free state.
  const port = nextDebugPort;
  nextDebugPort = nextDebugPort >= 29999 ? 9333 : nextDebugPort + 1;
  return port;
}

function buildProxyArg(proxy: ProxyConfig | null): string | null {
  if (!proxy || proxy.type === 'none') return null;
  const scheme = proxy.type === 'http' ? 'http' : proxy.type;
  return `${scheme}://${proxy.host}:${proxy.port}`;
}

function updateStatus(profileId: string, status: ProfileStatus, extra: Partial<LauncherStatus> = {}): void {
  setProfileStatus(profileId, status, status === 'running' ? Date.now() : undefined);
  emit({ profileId, status, ...extra });
}

export async function launchProfile(profileId: string): Promise<LauncherStatus> {
  const profile = getProfile(profileId);
  if (!profile) {
    const err: LauncherStatus = { profileId, status: 'error', error: 'profile not found' };
    emit(err);
    return err;
  }
  if (running.has(profileId)) {
    const r = running.get(profileId)!;
    return { profileId, status: 'running', pid: r.pid, remoteDebugPort: r.remoteDebugPort };
  }

  const settings = getSettings();
  const chromePath = settings.chromePath ?? detectChromePath();
  if (!chromePath || !existsSync(chromePath)) {
    const err: LauncherStatus = {
      profileId,
      status: 'error',
      error: 'Chrome/Edge binary not found. Configure path in Settings.',
    };
    setProfileStatus(profileId, 'error');
    emit(err);
    return err;
  }

  updateStatus(profileId, 'launching');

  const proxy = profile.proxyId ? getProxy(profile.proxyId) : null;
  const proxyArg = buildProxyArg(proxy);

  const extDir = writeFingerprintExtension(profile.dataDir, {
    fingerprint: profile.fingerprint,
    proxyAuth:
      proxy && proxy.username
        ? { username: proxy.username, password: proxy.password ?? '' }
        : undefined,
  });

  const debugPort = pickPort();
  const fp = profile.fingerprint;

  const args: string[] = [
    `--user-data-dir=${profile.dataDir}`,
    `--load-extension=${extDir}`,
    `--disable-extensions-except=${extDir}`,
    `--user-agent=${fp.userAgent}`,
    `--lang=${fp.locale}`,
    `--accept-lang=${fp.acceptLanguage}`,
    `--window-size=${fp.screenWidth},${fp.screenHeight}`,
    `--remote-debugging-port=${debugPort}`,
    '--no-default-browser-check',
    '--no-first-run',
    '--disable-features=Translate,IsolateOrigins,site-per-process',
    '--disable-blink-features=AutomationControlled',
    `--device-scale-factor=${fp.deviceScaleFactor}`,
  ];

  if (fp.webrtcMask) {
    args.push('--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
    args.push('--webrtc-ip-handling-policy=disable_non_proxied_udp');
  }

  if (proxyArg) {
    args.push(`--proxy-server=${proxyArg}`);
  }

  const startUrl = profile.startUrl ?? settings.defaultStartUrl;
  if (startUrl) args.push(startUrl);

  const child = spawn(chromePath, args, {
    detached: false,
    stdio: 'ignore',
    env: {
      ...process.env,
      TZ: fp.timezone,
    },
  });

  if (!child.pid) {
    const err: LauncherStatus = { profileId, status: 'error', error: 'Failed to spawn browser process.' };
    setProfileStatus(profileId, 'error');
    emit(err);
    return err;
  }

  running.set(profileId, { pid: child.pid, child, remoteDebugPort: debugPort });

  child.once('exit', () => {
    running.delete(profileId);
    updateStatus(profileId, 'idle');
  });

  child.once('error', (err) => {
    running.delete(profileId);
    setProfileStatus(profileId, 'error');
    emit({ profileId, status: 'error', error: err.message });
  });

  updateStatus(profileId, 'running', { pid: child.pid, remoteDebugPort: debugPort });

  return { profileId, status: 'running', pid: child.pid, remoteDebugPort: debugPort };
}

export async function launchProfiles(profileIds: string[]): Promise<LauncherStatus[]> {
  const settings = getSettings();
  const concurrency = Math.max(1, Math.min(50, settings.maxConcurrentLaunches));
  const queue = [...profileIds];
  const results: LauncherStatus[] = [];
  const workers: Promise<void>[] = [];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) return;
      const r = await launchProfile(id);
      results.push(r);
      // Small stagger so we don't hammer disks at exactly the same moment.
      await new Promise((res) => setTimeout(res, 150));
    }
  }

  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

export async function stopProfile(profileId: string): Promise<void> {
  const r = running.get(profileId);
  if (!r) {
    setProfileStatus(profileId, 'idle');
    return;
  }
  updateStatus(profileId, 'closing');
  try {
    r.child.kill();
  } catch {
    /* ignore */
  }
}

export function stopAllProfiles(): void {
  for (const [id, r] of running.entries()) {
    try {
      r.child.kill();
    } catch {
      /* ignore */
    }
    setProfileStatus(id, 'idle');
  }
  running.clear();
}

export function getRunningStatuses(): LauncherStatus[] {
  return Array.from(running.entries()).map(([profileId, r]) => ({
    profileId,
    status: 'running' as const,
    pid: r.pid,
    remoteDebugPort: r.remoteDebugPort,
  }));
}

export function isRunning(profileId: string): boolean {
  return running.has(profileId);
}

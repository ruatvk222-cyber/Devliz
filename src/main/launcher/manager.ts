import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AutomationConfig, LauncherStatus, ProfileStatus, ProxyConfig } from '@shared/types';
import { getProfile, setProfileStatus } from '../repositories/profiles';
import { getProxy } from '../repositories/proxies';
import { getSettings } from '../repositories/settings';
import { detectChromePath } from './chrome-path';
import { writeFingerprintExtension } from './extension';
import { authProxyApplies, startAuthProxy, type AuthProxyHandle } from './auth-proxy';
import {
  socks5ForwarderApplies,
  startSocks5Forwarder,
  type Socks5ForwarderHandle,
} from './socks5-forwarder';
import { prepareAutomation } from './automation';
import { applyExtensionPrefs } from './chrome-prefs';
import { extensionIdForPath } from './extension-id';
import { listExtensionsForProfile } from '../repositories/extensions';
import type { AutomationRegistration } from '../automation/listener';
import { startLaunchLog, type LaunchLogger } from './launch-log';

const GMAIL_URL = 'https://mail.google.com/mail/u/0/#inbox';

interface RunningProfile {
  pid: number;
  child: ChildProcess;
  remoteDebugPort: number;
  authProxy?: AuthProxyHandle;
  socks5Forwarder?: Socks5ForwarderHandle;
  automation?: {
    registration: AutomationRegistration;
    closeOnFinish: boolean;
  };
}

export interface LaunchOptions {
  automation?: AutomationConfig;
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

function attachChildLogging(child: ChildProcess, log: LaunchLogger): void {
  // Cap the captured browser stdout/stderr so a long-running session doesn't
  // grow the log file unbounded. Most useful info from Chrome lands in the
  // first ~64KB anyway (extension load errors, missing manifest, etc.).
  const MAX = 64 * 1024;
  let stdoutBytes = 0;
  let stderrBytes = 0;
  child.stdout?.on('data', (chunk: Buffer) => {
    if (stdoutBytes >= MAX) return;
    stdoutBytes += chunk.length;
    log.write(`[stdout] ${chunk.toString('utf8').replace(/\n/g, '\n[stdout] ')}`);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    if (stderrBytes >= MAX) return;
    stderrBytes += chunk.length;
    log.write(`[stderr] ${chunk.toString('utf8').replace(/\n/g, '\n[stderr] ')}`);
  });
}

interface ProxyBridge {
  authProxyPort: number | null;
  socks5ForwarderPort: number | null;
}

function buildProxyArg(proxy: ProxyConfig | null, bridge: ProxyBridge): string | null {
  if (!proxy || proxy.type === 'none') return null;
  // For HTTP/HTTPS upstreams that need auth, point Chrome at the local auth
  // bridge instead of the upstream directly. Chrome strips inline credentials
  // from --proxy-server URLs for http(s) and would prompt the user otherwise.
  if (bridge.authProxyPort !== null) {
    return `http://127.0.0.1:${bridge.authProxyPort}`;
  }
  // For SOCKS5 with auth, Chrome's --proxy-server flag also strips creds
  // (results in ERR_NO_SUPPORTED_PROXIES because Chrome can't run the
  // RFC 1929 user/pass sub-negotiation when the URL has user:pass@). Route
  // through our local SOCKS5 forwarder instead.
  if (bridge.socks5ForwarderPort !== null) {
    return `socks5://127.0.0.1:${bridge.socks5ForwarderPort}`;
  }
  const scheme = proxy.type === 'http' ? 'http' : proxy.type;
  // SOCKS4 has no user/pass sub-negotiation, so just inline.
  if (proxy.username && proxy.type === 'socks4') {
    const u = encodeURIComponent(proxy.username);
    const p = encodeURIComponent(proxy.password ?? '');
    return `${scheme}://${u}:${p}@${proxy.host}:${proxy.port}`;
  }
  return `${scheme}://${proxy.host}:${proxy.port}`;
}

function updateStatus(profileId: string, status: ProfileStatus, extra: Partial<LauncherStatus> = {}): void {
  setProfileStatus(profileId, status, status === 'running' ? Date.now() : undefined);
  emit({ profileId, status, ...extra });
}

export async function launchProfile(
  profileId: string,
  options: LaunchOptions = {},
): Promise<LauncherStatus> {
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

  const log = startLaunchLog(profileId);
  const settings = getSettings();
  const chromePath = settings.chromePath ?? detectChromePath();
  log.writeKv('chromePathFromSettings', settings.chromePath ?? '<unset>');
  log.writeKv('chromePathResolved', chromePath ?? '<not-found>');
  if (!chromePath || !existsSync(chromePath)) {
    log.write('ERROR: Chrome/Edge binary not found.');
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

  // For authenticated HTTP/HTTPS proxies, start a local CONNECT bridge so
  // Chrome doesn't pop the auth dialog. For authenticated SOCKS5 proxies,
  // start a local SOCKS5 forwarder that runs the user/pass handshake on
  // Chrome's behalf. SOCKS4 inlines auth into the URL directly.
  let authProxy: AuthProxyHandle | undefined;
  let socks5Forwarder: Socks5ForwarderHandle | undefined;
  if (authProxyApplies(proxy)) {
    try {
      authProxy = await startAuthProxy(proxy as ProxyConfig);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const e: LauncherStatus = {
        profileId,
        status: 'error',
        error: `Failed to start proxy auth bridge: ${msg}`,
      };
      setProfileStatus(profileId, 'error');
      emit(e);
      return e;
    }
  } else if (socks5ForwarderApplies(proxy)) {
    try {
      socks5Forwarder = await startSocks5Forwarder(proxy as ProxyConfig);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const e: LauncherStatus = {
        profileId,
        status: 'error',
        error: `Failed to start SOCKS5 forwarder: ${msg}`,
      };
      setProfileStatus(profileId, 'error');
      emit(e);
      return e;
    }
  }

  const proxyArg = buildProxyArg(proxy, {
    authProxyPort: authProxy ? authProxy.port : null,
    socks5ForwarderPort: socks5Forwarder ? socks5Forwarder.port : null,
  });

  const extDir = writeFingerprintExtension(profile.dataDir, {
    fingerprint: profile.fingerprint,
    // The auth bridge handles credentials transparently. We still keep the
    // extension-side onAuthRequired handler as a defense-in-depth fallback.
    proxyAuth:
      proxy && proxy.username
        ? { username: proxy.username, password: proxy.password ?? '' }
        : undefined,
  });

  // If automation is requested, copy the bundled automation extension into
  // the profile dir, register a webhook callback, and load it alongside the
  // fingerprint extension.
  let automationPrep: Awaited<ReturnType<typeof prepareAutomation>> | null = null;
  if (options.automation) {
    try {
      automationPrep = await prepareAutomation(
        profile.dataDir,
        options.automation,
        (event) => onAutomationEvent(profileId, event.phase),
      );
    } catch (err) {
      if (authProxy) await authProxy.close().catch(() => undefined);
      if (socks5Forwarder) await socks5Forwarder.close().catch(() => undefined);
      const msg = err instanceof Error ? err.message : String(err);
      const e: LauncherStatus = {
        profileId,
        status: 'error',
        error: `Failed to prepare automation: ${msg}`,
      };
      setProfileStatus(profileId, 'error');
      emit(e);
      return e;
    }
  }

  // Only include extensions whose folder still has a manifest.json on disk.
  // If we hand Chrome a stale path, Chrome silently drops the *entire* list
  // (we've seen Edge in particular load zero extensions when one of the paths
  // was missing) — so be defensive here.
  const candidateDirs: string[] = [extDir];
  if (automationPrep) candidateDirs.push(automationPrep.extDir);
  const userExts = listExtensionsForProfile(profileId);
  for (const ue of userExts) candidateDirs.push(ue.extDir);

  const extensionDirs: string[] = [];
  const skippedDirs: { dir: string; reason: string }[] = [];
  for (const dir of candidateDirs) {
    if (!existsSync(dir)) {
      skippedDirs.push({ dir, reason: 'directory missing' });
      continue;
    }
    if (!existsSync(join(dir, 'manifest.json'))) {
      skippedDirs.push({ dir, reason: 'manifest.json missing' });
      continue;
    }
    extensionDirs.push(dir);
  }

  log.writeKv('extensionDirs', extensionDirs);
  if (skippedDirs.length) log.writeKv('skippedExtensionDirs', skippedDirs);

  const loadList = extensionDirs.join(',');

  // Pre-write Chrome's Default/Preferences so:
  //   1. chrome://extensions opens with Developer Mode already on, and
  //   2. the loaded extensions are pinned to the toolbar (visible icons).
  //      This is what the user sees as "the Gmail Auto Reader extension is
  //      installed and pinned" without them touching anything.
  try {
    const pinIds = extensionDirs.map((d) => extensionIdForPath(d));
    applyExtensionPrefs(profile.dataDir, pinIds);
  } catch {
    /* non-fatal — Chrome will still launch, just without the dev-mode toggle */
  }

  const debugPort = pickPort();
  const fp = profile.fingerprint;

  const args: string[] = [
    `--user-data-dir=${profile.dataDir}`,
    `--user-agent=${fp.userAgent}`,
    `--lang=${fp.locale}`,
    `--accept-lang=${fp.acceptLanguage}`,
    `--window-size=${fp.screenWidth},${fp.screenHeight}`,
    `--remote-debugging-port=${debugPort}`,
    '--no-default-browser-check',
    '--no-first-run',
    '--disable-features=Translate,IsolateOrigins,site-per-process',
    `--device-scale-factor=${fp.deviceScaleFactor}`,
  ];

  // Just `--load-extension` — no `--disable-extensions-except`.
  // We rely on `--user-data-dir` to fully isolate this profile, so there are
  // no other extensions to disable on a fresh datadir. We previously emitted
  // `--disable-extensions-except=<same paths>` to be explicit, but on Chrome
  // 124+ that combination causes Chrome to load the extension successfully
  // (toast "Extension loaded" appears) yet hide it from chrome://extensions
  // — likely because of a path-normalisation mismatch on Windows. Removing
  // the flag restores normal display.
  if (loadList.length > 0) {
    args.push(`--load-extension=${loadList}`);
  }

  if (fp.webrtcMask) {
    args.push('--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
    args.push('--webrtc-ip-handling-policy=disable_non_proxied_udp');
  }

  if (proxyArg) {
    args.push(`--proxy-server=${proxyArg}`);
  }

  // When running an automation that targets Gmail, force the first tab to be
  // Gmail itself. Background.js will set autoStart=true, content.js will pick
  // it up the moment Gmail finishes loading, and the run kicks off without
  // any human clicking the popup.
  let startUrl: string | undefined;
  if (options.automation?.kind === 'gmail-auto-reader') {
    startUrl = GMAIL_URL;
  } else {
    startUrl = profile.startUrl ?? settings.defaultStartUrl;
  }
  if (startUrl) args.push(startUrl);

  log.writeKv('args', args);
  log.writeKv('userDataDir', profile.dataDir);
  log.writeKv('startUrl', startUrl ?? '');

  const child = spawn(chromePath, args, {
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TZ: fp.timezone,
    },
  });

  attachChildLogging(child, log);

  if (!child.pid) {
    if (authProxy) await authProxy.close().catch(() => undefined);
    if (socks5Forwarder) await socks5Forwarder.close().catch(() => undefined);
    if (automationPrep) automationPrep.registration.unregister();
    const err: LauncherStatus = { profileId, status: 'error', error: 'Failed to spawn browser process.' };
    setProfileStatus(profileId, 'error');
    emit(err);
    return err;
  }

  running.set(profileId, {
    pid: child.pid,
    child,
    remoteDebugPort: debugPort,
    authProxy,
    socks5Forwarder,
    automation: automationPrep
      ? {
          registration: automationPrep.registration,
          closeOnFinish: options.automation?.closeOnFinish ?? true,
        }
      : undefined,
  });

  child.once('exit', (code, signal) => {
    log.writeKv('exit', { code, signal });
    const r = running.get(profileId);
    if (r?.authProxy) void r.authProxy.close().catch(() => undefined);
    if (r?.socks5Forwarder) void r.socks5Forwarder.close().catch(() => undefined);
    if (r?.automation) r.automation.registration.unregister();
    running.delete(profileId);
    updateStatus(profileId, 'idle');
  });

  child.once('error', (err) => {
    log.writeKv('spawnError', err.message);
    const r = running.get(profileId);
    if (r?.authProxy) void r.authProxy.close().catch(() => undefined);
    if (r?.socks5Forwarder) void r.socks5Forwarder.close().catch(() => undefined);
    if (r?.automation) r.automation.registration.unregister();
    running.delete(profileId);
    setProfileStatus(profileId, 'error');
    emit({ profileId, status: 'error', error: err.message });
  });

  updateStatus(profileId, 'running', { pid: child.pid, remoteDebugPort: debugPort });

  return { profileId, status: 'running', pid: child.pid, remoteDebugPort: debugPort };
}

export async function launchProfiles(
  profileIds: string[],
  options: LaunchOptions = {},
): Promise<LauncherStatus[]> {
  const settings = getSettings();
  const concurrency = Math.max(1, Math.min(50, settings.maxConcurrentLaunches));
  const queue = [...profileIds];
  const results: LauncherStatus[] = [];
  const workers: Promise<void>[] = [];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) return;
      const r = await launchProfile(id, options);
      results.push(r);
      // Small stagger so we don't hammer disks at exactly the same moment.
      await new Promise((res) => setTimeout(res, 150));
    }
  }

  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

/**
 * Called from the automation HTTP listener when an extension reports a
 * progress event. We only act on terminal phases — when an automation
 * finishes (or errors / is stopped), close the profile if its config asked
 * us to.
 */
function onAutomationEvent(
  profileId: string,
  phase:
    | 'bootstrap'
    | 'started'
    | 'opening'
    | 'reading'
    | 'done-item'
    | 'finished'
    | 'no-unread'
    | 'error'
    | 'stopped',
): void {
  const terminal =
    phase === 'finished' || phase === 'no-unread' || phase === 'error' || phase === 'stopped';
  if (!terminal) return;
  const r = running.get(profileId);
  if (!r) return;
  if (!r.automation || !r.automation.closeOnFinish) return;
  // Give the in-page overlay a couple of seconds so the user sees the
  // 'Done' state before the window closes.
  setTimeout(() => {
    void stopProfile(profileId).catch(() => undefined);
  }, 2500);
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
    if (r.authProxy) void r.authProxy.close().catch(() => undefined);
    if (r.socks5Forwarder) void r.socks5Forwarder.close().catch(() => undefined);
    if (r.automation) r.automation.registration.unregister();
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

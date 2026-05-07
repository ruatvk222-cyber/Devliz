import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import type { AutomationConfig, LauncherStatus, ProfileStatus, ProxyConfig } from '@shared/types';
import { getProfile, setProfileStatus } from '../repositories/profiles';
import { getProxy } from '../repositories/proxies';
import { getSettings } from '../repositories/settings';
import { detectChromePath } from './chrome-path';
import { writeFingerprintExtension } from './extension';
import { authProxyApplies, startAuthProxy, type AuthProxyHandle } from './auth-proxy';
import { prepareAutomation } from './automation';
import { applyExtensionPrefs } from './chrome-prefs';
import { extensionIdForPath } from './extension-id';
import type { AutomationRegistration } from '../automation/listener';

const GMAIL_URL = 'https://mail.google.com/mail/u/0/#inbox';

interface RunningProfile {
  pid: number;
  child: ChildProcess;
  remoteDebugPort: number;
  authProxy?: AuthProxyHandle;
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

function buildProxyArg(proxy: ProxyConfig | null, authBridgePort: number | null): string | null {
  if (!proxy || proxy.type === 'none') return null;
  // For HTTP/HTTPS upstreams that need auth, point Chrome at the local auth
  // bridge instead of the upstream directly. Chrome strips inline credentials
  // from --proxy-server URLs for http(s) and would prompt the user otherwise.
  if (authBridgePort !== null) {
    return `http://127.0.0.1:${authBridgePort}`;
  }
  const scheme = proxy.type === 'http' ? 'http' : proxy.type;
  // SOCKS supports inline credentials in the proxy URL (Chrome handles auth).
  if (proxy.username && (proxy.type === 'socks4' || proxy.type === 'socks5')) {
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

  // For authenticated HTTP/HTTPS proxies, start a local bridge so Chrome
  // doesn't pop the auth dialog. SOCKS upstreams handle auth in the URL.
  let authProxy: AuthProxyHandle | undefined;
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
  }

  const proxyArg = buildProxyArg(proxy, authProxy ? authProxy.port : null);

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

  const extensionDirs: string[] = [extDir];
  if (automationPrep) extensionDirs.push(automationPrep.extDir);
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
    `--load-extension=${loadList}`,
    `--disable-extensions-except=${loadList}`,
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

  const child = spawn(chromePath, args, {
    detached: false,
    stdio: 'ignore',
    env: {
      ...process.env,
      TZ: fp.timezone,
    },
  });

  if (!child.pid) {
    if (authProxy) await authProxy.close().catch(() => undefined);
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
    automation: automationPrep
      ? {
          registration: automationPrep.registration,
          closeOnFinish: options.automation?.closeOnFinish ?? true,
        }
      : undefined,
  });

  child.once('exit', () => {
    const r = running.get(profileId);
    if (r?.authProxy) void r.authProxy.close().catch(() => undefined);
    if (r?.automation) r.automation.registration.unregister();
    running.delete(profileId);
    updateStatus(profileId, 'idle');
  });

  child.once('error', (err) => {
    const r = running.get(profileId);
    if (r?.authProxy) void r.authProxy.close().catch(() => undefined);
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

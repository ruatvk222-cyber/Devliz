export type ProxyType = 'none' | 'http' | 'https' | 'socks4' | 'socks5';

export interface ProxyConfig {
  id: string;
  type: ProxyType;
  host: string;
  port: number;
  username?: string;
  password?: string;
  label?: string;
  /** Last known status. */
  status?: 'unknown' | 'live' | 'dead';
  lastCheckedAt?: number;
  lastIp?: string;
  lastCountry?: string;
  createdAt: number;
}

export type OsPlatform = 'windows' | 'macos' | 'linux';

export interface FingerprintConfig {
  /** Full User-Agent string. */
  userAgent: string;
  /** Locale, e.g. "en-US". */
  locale: string;
  /** Accept-Language header value, e.g. "en-US,en;q=0.9". */
  acceptLanguage: string;
  /** IANA timezone, e.g. "America/Los_Angeles". */
  timezone: string;
  /** Screen / window resolution. */
  screenWidth: number;
  screenHeight: number;
  /** Device pixel ratio. */
  deviceScaleFactor: number;
  /** Reported platform string (navigator.platform), e.g. "Win32". */
  platform: string;
  /** Reported os family for navigator.userAgentData. */
  os: OsPlatform;
  /** Hardware concurrency. */
  hardwareConcurrency: number;
  /** Device memory in GB. */
  deviceMemory: number;
  /** Whether WebRTC IPs should be masked. */
  webrtcMask: boolean;
  /** Whether to add small noise to canvas pixel reads. */
  canvasNoise: boolean;
  /** Whether to add small noise to AudioContext. */
  audioNoise: boolean;
  /** Whether to add small noise to WebGL params. */
  webglNoise: boolean;
  /** Reported GPU vendor string. */
  webglVendor: string;
  /** Reported GPU renderer string. */
  webglRenderer: string;
}

export type ProfileStatus = 'idle' | 'launching' | 'running' | 'closing' | 'error';

export interface Profile {
  id: string;
  name: string;
  /** Optional group/folder name. */
  group?: string;
  /** Comma-separated tags. */
  tags?: string;
  notes?: string;
  /** Optional starting URL when launching. */
  startUrl?: string;
  proxyId?: string;
  fingerprint: FingerprintConfig;
  /** Resolved on-disk path for the profile data dir. Set by the main process. */
  dataDir: string;
  status: ProfileStatus;
  lastLaunchedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface BulkCreateOptions {
  count: number;
  namePrefix: string;
  group?: string;
  /** If provided, profiles are paired with these proxy ids round-robin. */
  proxyIds?: string[];
  /** Optional starting URL. */
  startUrl?: string;
  /** Override for OS family (defaults to mix). */
  osMix?: OsPlatform[];
}

export interface ProxyImportOptions {
  /** Lines like ip:port[:user:pass] or scheme://user:pass@host:port. */
  text: string;
  defaultType: ProxyType;
}

export interface ProxyCheckResult {
  id: string;
  ok: boolean;
  ip?: string;
  country?: string;
  latencyMs?: number;
  error?: string;
}

export interface LauncherStatus {
  profileId: string;
  status: ProfileStatus;
  pid?: number;
  remoteDebugPort?: number;
  error?: string;
}

export interface AppSettings {
  /** Optional override for Chrome/Chromium binary path (Windows). */
  chromePath?: string;
  /** Max concurrent launches when starting a batch. */
  maxConcurrentLaunches: number;
  /** Default starting URL for new profiles. */
  defaultStartUrl: string;
  /** Where profile data dirs are stored. Default: <userData>/profiles. */
  profilesRoot?: string;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  maxConcurrentLaunches: 5,
  defaultStartUrl: 'https://abrahamjuliot.github.io/creepjs/',
};

export interface IpcApi {
  profiles: {
    list(): Promise<Profile[]>;
    get(id: string): Promise<Profile | null>;
    create(input: Partial<Profile>): Promise<Profile>;
    bulkCreate(options: BulkCreateOptions): Promise<Profile[]>;
    update(id: string, patch: Partial<Profile>): Promise<Profile>;
    delete(id: string): Promise<void>;
    deleteMany(ids: string[]): Promise<void>;
    duplicate(id: string): Promise<Profile>;
  };
  proxies: {
    list(): Promise<ProxyConfig[]>;
    create(input: Omit<ProxyConfig, 'id' | 'createdAt'>): Promise<ProxyConfig>;
    update(id: string, patch: Partial<ProxyConfig>): Promise<ProxyConfig>;
    delete(id: string): Promise<void>;
    importBulk(options: ProxyImportOptions): Promise<ProxyConfig[]>;
    check(ids: string[]): Promise<ProxyCheckResult[]>;
  };
  launcher: {
    launch(profileId: string): Promise<LauncherStatus>;
    launchMany(profileIds: string[]): Promise<LauncherStatus[]>;
    stop(profileId: string): Promise<void>;
    stopAll(): Promise<void>;
    status(): Promise<LauncherStatus[]>;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(patch: Partial<AppSettings>): Promise<AppSettings>;
    detectChromePath(): Promise<string | null>;
  };
  events: {
    /** Subscribe to launcher status updates. Returns an unsubscribe fn. */
    onLauncherStatus(callback: (status: LauncherStatus) => void): () => void;
    onProxyCheckProgress(callback: (result: ProxyCheckResult) => void): () => void;
  };
}

declare global {
  interface Window {
    api: IpcApi;
  }
}

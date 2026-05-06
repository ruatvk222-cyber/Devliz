import type { FingerprintConfig, OsPlatform } from './types';

const WINDOWS_UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
];

const MAC_UAS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
];

const LINUX_UAS = [
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
];

const RESOLUTIONS: Array<[number, number]> = [
  [1920, 1080],
  [1366, 768],
  [1536, 864],
  [1440, 900],
  [1600, 900],
  [1280, 720],
  [1280, 800],
  [2560, 1440],
];

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Stockholm',
  'Europe/Warsaw',
  'Europe/Moscow',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'Asia/Seoul',
  'Asia/Bangkok',
  'Asia/Ho_Chi_Minh',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
];

const LOCALES: Array<{ locale: string; acceptLanguage: string }> = [
  { locale: 'en-US', acceptLanguage: 'en-US,en;q=0.9' },
  { locale: 'en-GB', acceptLanguage: 'en-GB,en;q=0.9' },
  { locale: 'en-CA', acceptLanguage: 'en-CA,en;q=0.9' },
  { locale: 'en-AU', acceptLanguage: 'en-AU,en;q=0.9' },
  { locale: 'fr-FR', acceptLanguage: 'fr-FR,fr;q=0.9,en;q=0.8' },
  { locale: 'de-DE', acceptLanguage: 'de-DE,de;q=0.9,en;q=0.8' },
  { locale: 'es-ES', acceptLanguage: 'es-ES,es;q=0.9,en;q=0.8' },
  { locale: 'it-IT', acceptLanguage: 'it-IT,it;q=0.9,en;q=0.8' },
  { locale: 'pt-BR', acceptLanguage: 'pt-BR,pt;q=0.9,en;q=0.8' },
  { locale: 'ja-JP', acceptLanguage: 'ja-JP,ja;q=0.9,en;q=0.8' },
  { locale: 'ko-KR', acceptLanguage: 'ko-KR,ko;q=0.9,en;q=0.8' },
  { locale: 'zh-CN', acceptLanguage: 'zh-CN,zh;q=0.9,en;q=0.8' },
  { locale: 'vi-VN', acceptLanguage: 'vi-VN,vi;q=0.9,en;q=0.8' },
];

const WEBGL_RENDERERS = [
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' },
];

const HW_CONCURRENCIES = [4, 6, 8, 12, 16];
const DEVICE_MEMORIES = [4, 8, 16, 32];

export function pick<T>(arr: readonly T[], rng: () => number = Math.random): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

export function generateFingerprint(os?: OsPlatform): FingerprintConfig {
  const target = os ?? pick(['windows', 'macos', 'linux'] as const);
  let userAgent: string;
  let platform: string;
  switch (target) {
    case 'windows':
      userAgent = pick(WINDOWS_UAS);
      platform = 'Win32';
      break;
    case 'macos':
      userAgent = pick(MAC_UAS);
      platform = 'MacIntel';
      break;
    case 'linux':
      userAgent = pick(LINUX_UAS);
      platform = 'Linux x86_64';
      break;
  }
  const [w, h] = pick(RESOLUTIONS);
  const locale = pick(LOCALES);
  const gpu = pick(WEBGL_RENDERERS);
  return {
    userAgent,
    locale: locale.locale,
    acceptLanguage: locale.acceptLanguage,
    timezone: pick(TIMEZONES),
    screenWidth: w,
    screenHeight: h,
    deviceScaleFactor: pick([1, 1, 1, 2]),
    platform,
    os: target,
    hardwareConcurrency: pick(HW_CONCURRENCIES),
    deviceMemory: pick(DEVICE_MEMORIES),
    webrtcMask: true,
    canvasNoise: true,
    audioNoise: true,
    webglNoise: true,
    webglVendor: gpu.vendor,
    webglRenderer: gpu.renderer,
  };
}

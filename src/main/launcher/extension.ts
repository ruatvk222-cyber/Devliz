import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FingerprintConfig } from '@shared/types';

const EXTENSION_NAME = 'devliz-fingerprint';

interface ExtensionContext {
  fingerprint: FingerprintConfig;
  proxyAuth?: { username: string; password: string };
}

/**
 * Build a per-profile Chrome extension that:
 *   - spoofs navigator.* / screen.* / Date timezone / WebGL params
 *   - adds tiny noise to canvas and audio reads
 *   - handles proxy basic auth (chrome.webRequest.onAuthRequired)
 *
 * The extension is written into the profile's data dir at <dataDir>/<EXTENSION_NAME>.
 */
export function writeFingerprintExtension(dataDir: string, ctx: ExtensionContext): string {
  const extDir = join(dataDir, EXTENSION_NAME);
  mkdirSync(extDir, { recursive: true });

  const manifest = {
    manifest_version: 3,
    name: 'Devliz Fingerprint Spoofer',
    version: '1.0.0',
    description: 'Spoofs browser fingerprint and handles proxy auth for this Devliz profile.',
    permissions: ['webRequest', 'webRequestAuthProvider', 'storage'],
    host_permissions: ['<all_urls>'],
    background: { service_worker: 'background.js' },
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['inject.js'],
        run_at: 'document_start',
        all_frames: true,
        world: 'MAIN',
      },
    ],
  };
  writeFileSync(join(extDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const config = {
    fingerprint: ctx.fingerprint,
    proxyAuth: ctx.proxyAuth ?? null,
  };
  writeFileSync(join(extDir, 'config.js'), `window.__DEVLIZ_CFG__ = ${JSON.stringify(config)};`);

  writeFileSync(join(extDir, 'inject.js'), buildInjectScript(ctx.fingerprint));
  writeFileSync(join(extDir, 'background.js'), buildBackgroundScript(ctx.proxyAuth));

  return extDir;
}

function buildInjectScript(fp: FingerprintConfig): string {
  return `(() => {
  const fp = ${JSON.stringify(fp)};
  try {
    Object.defineProperty(navigator, 'platform', { get: () => fp.platform });
    Object.defineProperty(navigator, 'language', { get: () => fp.locale });
    Object.defineProperty(navigator, 'languages', { get: () => [fp.locale, fp.locale.split('-')[0]] });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => fp.hardwareConcurrency });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => fp.deviceMemory });
  } catch (e) { /* ignore */ }

  try {
    const sw = fp.screenWidth, sh = fp.screenHeight;
    Object.defineProperty(screen, 'width', { get: () => sw });
    Object.defineProperty(screen, 'height', { get: () => sh });
    Object.defineProperty(screen, 'availWidth', { get: () => sw });
    Object.defineProperty(screen, 'availHeight', { get: () => sh - 40 });
    Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
    Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });
    Object.defineProperty(window, 'devicePixelRatio', { get: () => fp.deviceScaleFactor });
  } catch (e) { /* ignore */ }

  try {
    const origGetParameter = WebGLRenderingContext.prototype.getParameter;
    const origGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
    const UNMASKED_VENDOR = 0x9245, UNMASKED_RENDERER = 0x9246;
    function patched(parameter) {
      if (parameter === UNMASKED_VENDOR) return fp.webglVendor;
      if (parameter === UNMASKED_RENDERER) return fp.webglRenderer;
      return origGetParameter.call(this, parameter);
    }
    WebGLRenderingContext.prototype.getParameter = patched;
    WebGL2RenderingContext.prototype.getParameter = function(p) {
      if (p === UNMASKED_VENDOR) return fp.webglVendor;
      if (p === UNMASKED_RENDERER) return fp.webglRenderer;
      return origGetParameter2.call(this, p);
    };
  } catch (e) { /* ignore */ }

  if (fp.canvasNoise) {
    try {
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(...args) {
        const ctx = this.getContext('2d');
        if (ctx && this.width > 0 && this.height > 0) {
          try {
            const data = ctx.getImageData(0, 0, this.width, this.height);
            for (let i = 0; i < data.data.length; i += 4) {
              data.data[i] = (data.data[i] + ((Math.random() * 2) | 0)) & 0xff;
            }
            ctx.putImageData(data, 0, 0);
          } catch (_) { /* ignore */ }
        }
        return origToDataURL.apply(this, args);
      };
    } catch (e) { /* ignore */ }
  }

  if (fp.audioNoise) {
    try {
      const orig = AnalyserNode.prototype.getFloatFrequencyData;
      AnalyserNode.prototype.getFloatFrequencyData = function(arr) {
        orig.call(this, arr);
        for (let i = 0; i < arr.length; i++) arr[i] += (Math.random() - 0.5) * 0.0001;
      };
    } catch (e) { /* ignore */ }
  }

  try {
    const TZ = fp.timezone;
    const origDTF = Intl.DateTimeFormat;
    function PatchedDTF(locale, opts) {
      const o = Object.assign({}, opts || {});
      if (!o.timeZone) o.timeZone = TZ;
      return new origDTF(locale || fp.locale, o);
    }
    PatchedDTF.prototype = origDTF.prototype;
    PatchedDTF.supportedLocalesOf = origDTF.supportedLocalesOf;
    Intl.DateTimeFormat = PatchedDTF;
    const origResolvedOptions = origDTF.prototype.resolvedOptions;
    origDTF.prototype.resolvedOptions = function() {
      const r = origResolvedOptions.call(this);
      r.timeZone = TZ;
      r.locale = fp.locale;
      return r;
    };
  } catch (e) { /* ignore */ }

  if (fp.webrtcMask) {
    try {
      const origRTC = window.RTCPeerConnection;
      if (origRTC) {
        const Patched = function(cfg) {
          const c = cfg || {};
          c.iceServers = [];
          c.iceTransportPolicy = 'relay';
          return new origRTC(c);
        };
        Patched.prototype = origRTC.prototype;
        window.RTCPeerConnection = Patched;
      }
    } catch (e) { /* ignore */ }
  }
})();
`;
}

function buildBackgroundScript(auth?: { username: string; password: string }): string {
  if (!auth) {
    return `// no proxy auth required\n`;
  }
  return `const AUTH = ${JSON.stringify(auth)};
chrome.webRequest.onAuthRequired.addListener(
  (details, callback) => {
    if (details.isProxy) {
      callback({ authCredentials: { username: AUTH.username, password: AUTH.password } });
    } else {
      callback({});
    }
  },
  { urls: ['<all_urls>'] },
  ['asyncBlocking']
);
`;
}

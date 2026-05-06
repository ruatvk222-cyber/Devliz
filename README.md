# Devliz

Antidetect browser profile manager — a Windows desktop app that lets you create
and manage many isolated Chrome profiles in bulk, each with its own user-data
directory, proxy, and fingerprint.

> **⚠️ Disclaimer.** Using antidetect tools to circumvent platform anti-fraud
> systems (Facebook, TikTok, Google, etc.) typically violates those platforms'
> Terms of Service, and accounts may be banned. Use at your own risk. Devliz is
> provided as-is for legitimate purposes such as multi-account management,
> QA testing, and privacy.

## Features

- 🚀 **Bulk profile creation** — type a number, generate N isolated profiles in
  one click. Each profile gets its own Chrome user-data-dir.
- 🌐 **Per-profile proxies** — HTTP / HTTPS / SOCKS4 / SOCKS5 with optional
  username + password. Bulk import from text (any common format).
- 🎭 **Fingerprint randomization** — User-Agent, locale, timezone, screen
  resolution, hardware concurrency, device memory, WebGL vendor / renderer,
  plus optional canvas / audio / WebGL noise via an injected extension.
- 🛡️ **WebRTC leak masking** — sets Chrome's WebRTC IP-handling policy and
  patches `RTCPeerConnection` to prevent real IP leaks.
- 🌀 **Parallel launcher** — launch one profile or hundreds; a configurable
  concurrency cap keeps your machine sane.
- ✅ **Proxy live check** — verify proxies in batch, show real outbound IP
  and country.
- 💾 **Local SQLite storage** (`better-sqlite3`) — no cloud, all data lives in
  Electron's `userData` directory.

## Tech stack

- **Electron 32** + **electron-vite** (main / preload / renderer)
- **React 18** + **TypeScript** + **TailwindCSS** (renderer)
- **better-sqlite3** (local DB)
- **undici** + `https-proxy-agent` / `socks-proxy-agent` (proxy live checks)
- **electron-builder** → NSIS `.exe` for Windows

## Project layout

```
src/
├── main/              # Electron main process
│   ├── index.ts       # window + lifecycle
│   ├── db.ts          # SQLite init + WAL pragmas
│   ├── ipc/           # IPC handlers
│   ├── repositories/  # profiles / proxies / settings
│   ├── launcher/      # Chrome path detection, extension generator, manager
│   └── proxy/         # proxy live checker
├── preload/           # contextBridge exposing window.api
├── renderer/          # React app
│   ├── pages/         # Profiles / Proxies / Settings
│   ├── components/    # Sidebar, Modal, Drawer, BulkCreateModal, …
│   └── store.ts       # zustand store
└── shared/            # types and fingerprint pool shared between main & renderer
```

## Development

```bash
npm install
npm run dev              # launches Electron with hot reload
```

## Build (Windows .exe)

```bash
npm run build:win        # full installer (NSIS)
npm run build:win:dir    # unpacked dir (faster smoke-test)
```

The installer is written to `release/`.

## How fingerprinting works

Per-profile spoofing is layered:

1. **Chrome CLI flags**: `--user-agent`, `--lang`, `--accept-lang`,
   `--window-size`, `--device-scale-factor`,
   `--force-webrtc-ip-handling-policy`, `--proxy-server`, etc.
2. **Per-profile MV3 extension** (auto-generated into the user-data-dir):
   - patches `navigator.platform / language / hardwareConcurrency / deviceMemory`
   - patches `screen.width / height / availWidth / availHeight`,
     `window.devicePixelRatio`
   - patches `WebGL[2]RenderingContext.getParameter` for `UNMASKED_VENDOR_WEBGL`
     and `UNMASKED_RENDERER_WEBGL`
   - adds tiny per-pixel noise to `HTMLCanvasElement.toDataURL`
   - adds tiny noise to `AnalyserNode.getFloatFrequencyData`
   - patches `Intl.DateTimeFormat` to lock the timezone
   - replaces `RTCPeerConnection` to force `iceTransportPolicy: 'relay'`
3. **Proxy basic auth** is handled by the same extension via
   `chrome.webRequest.onAuthRequired` so authenticated proxies don't pop a
   dialog.

> This **does not** patch the Chromium binary, so commercial-grade detectors
> (creepjs pro, fingerprintjs pro) can still spot inconsistencies. Devliz is
> meant to defeat ordinary fingerprint-based linking, not commercial fraud
> engines.

## Storage

- Database: `<userData>/devliz.db` (SQLite WAL).
- Per-profile Chrome user-data-dirs: `<userData>/profiles/<profile-id>/`.

To wipe a profile completely, delete it in the UI and remove its directory
on disk.

## License

MIT

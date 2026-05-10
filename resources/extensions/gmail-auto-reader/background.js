/* global chrome */
'use strict';

const GMAIL_URL = 'https://mail.google.com/mail/u/0/#inbox';

// NOTE: We deliberately do NOT seed defaults via chrome.runtime.onInstalled.
// Doing so races against devlizBootstrap() (which writes the user's per-launch
// config) and can clobber it with hard-coded defaults like maxItems=50.
// Defaults live in content.js / popup.js fallbacks instead.

// Allow other extension surfaces (popup, content script) to ask the background
// to open / focus a Gmail tab.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'gar:open-gmail') return false;
  chrome.tabs.query({ url: 'https://mail.google.com/*' }, (tabs) => {
    if (tabs && tabs.length > 0) {
      const t = tabs[0];
      chrome.tabs.update(t.id, { active: true });
      if (t.windowId !== undefined) {
        try {
          chrome.windows.update(t.windowId, { focused: true });
        } catch (_) {
          /* ignore */
        }
      }
      sendResponse({ ok: true, tabId: t.id, created: false });
    } else {
      chrome.tabs.create({ url: GMAIL_URL, active: true }, (tab) => {
        sendResponse({ ok: true, tabId: tab && tab.id, created: true });
      });
    }
  });
  return true; // keep channel open for async sendResponse
});

// ---------- Devliz auto-bootstrap ----------
//
// When the extension is loaded with a `devliz-config.json` next to this file,
// the host app (Devliz) wants the automation to start without a human clicking
// the popup. The config tells us:
//   - readSeconds / maxItems / humanLike → seed chrome.storage.sync
//   - autoStart=true                     → set chrome.storage.local autoStart
//   - webhookUrl + token                 → POST progress events back so Devliz
//                                          can close the profile when finished.
//
// chrome.storage.local + a fresh autoStartTs are how content.js decides to
// start automatically once Gmail finishes loading.

const DEVLIZ_CONFIG_URL = chrome.runtime.getURL('devliz-config.json');
let devlizCfg = null;
let devlizFinished = false;

async function devlizLoadConfig() {
  try {
    const res = await fetch(DEVLIZ_CONFIG_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

function devlizPromisify(fn) {
  return new Promise((resolve) => fn(resolve));
}

async function devlizPostEvent(phase, detail) {
  if (!devlizCfg || !devlizCfg.webhookUrl || !devlizCfg.token) return;
  try {
    await fetch(devlizCfg.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: devlizCfg.token, phase, detail }),
    });
  } catch (_) {
    /* network errors are non-fatal — the profile may already be closing */
  }
}

async function devlizBootstrap() {
  const cfg = await devlizLoadConfig();
  if (!cfg || !cfg.autoStart) return;
  devlizCfg = cfg;
  devlizFinished = false;

  const readSeconds = clampInt(cfg.readSeconds, 1, 120, 5);
  const maxItems = clampInt(cfg.maxItems, 1, 200, 20);
  const humanLike = !!cfg.humanLike;

  // Write everything to storage.local in a SINGLE call. This is per-profile
  // per-extension, doesn't depend on a Google account (unlike storage.sync),
  // and atomically commits all keys so content.js / popup.js can't observe a
  // partial state where autoStart=true but readSeconds is still default.
  // We also mirror to storage.sync purely for any user that opens the popup
  // and edits values — they'll persist across reloads.
  await devlizPromisify((cb) =>
    chrome.storage.local.set(
      {
        readSeconds,
        maxItems,
        humanLike,
        autoStart: true,
        autoStartTs: Date.now(),
      },
      cb,
    ),
  );
  try {
    chrome.storage.sync.set({ readSeconds, maxItems, humanLike });
  } catch (_) {
    /* sync may be unavailable; local already has the values */
  }

  // Devliz already passes the Gmail URL on the Chrome command line, so the
  // first window is opening on Gmail by the time we get here. We only need
  // to open / focus a tab as a fallback — give Chrome a moment first to
  // avoid creating a second duplicate Gmail tab.
  setTimeout(() => {
    chrome.tabs.query({ url: 'https://mail.google.com/*' }, (tabs) => {
      if (tabs && tabs.length > 0) {
        const t = tabs[0];
        try {
          chrome.tabs.update(t.id, { active: true });
        } catch (_) {
          /* ignore */
        }
        if (t.windowId !== undefined) {
          try {
            chrome.windows.update(t.windowId, { focused: true });
          } catch (_) {
            /* ignore */
          }
        }
      } else {
        chrome.tabs.create({ url: GMAIL_URL, active: true });
      }
    });
  }, 1500);

  await devlizPostEvent('bootstrap', { readSeconds, maxItems, humanLike });
}

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Listen for progress messages from the content script. When the run reaches
// a terminal phase, ping Devliz so it can close the profile.
chrome.runtime.onMessage.addListener((msg) => {
  if (!devlizCfg) return false;
  if (!msg || msg.type !== 'gar:progress' || !msg.progress) return false;
  const phase = msg.progress.phase;
  if (
    !devlizFinished &&
    (phase === 'finished' ||
      phase === 'no-unread' ||
      phase === 'error' ||
      phase === 'stopped')
  ) {
    devlizFinished = true;
    void devlizPostEvent(phase, msg.progress);
  }
  return false;
});

// Top-level boot is the most reliable trigger when Chrome is launched fresh
// with --load-extension. onStartup / onInstalled both fire too, but the SW is
// already running here.
void devlizBootstrap();
chrome.runtime.onStartup.addListener(() => {
  void devlizBootstrap();
});

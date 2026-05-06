import { existsSync } from 'node:fs';
import { join } from 'node:path';

const WIN_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome Beta/Application/chrome.exe',
  'C:/Program Files/Google/Chrome SxS/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

const MAC_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

const LINUX_CANDIDATES = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
  '/snap/bin/chromium',
];

export function detectChromePath(): string | null {
  const platform = process.platform;
  let candidates: string[] = [];
  if (platform === 'win32') {
    candidates = [...WIN_CANDIDATES];
    const localAppData = process.env['LOCALAPPDATA'];
    if (localAppData) {
      candidates.unshift(join(localAppData, 'Google/Chrome/Application/chrome.exe'));
    }
  } else if (platform === 'darwin') {
    candidates = MAC_CANDIDATES;
  } else {
    candidates = LINUX_CANDIDATES;
  }
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { URL } from 'node:url';
import { nanoid } from 'nanoid';
import AdmZip from 'adm-zip';
import type {
  AddExtensionFolderInput,
  AddExtensionStoreInput,
  AddExtensionZipInput,
  UserExtension,
} from '@shared/types';
import { extensionsBaseDir, insertExtension } from '../repositories/extensions';

/** Extract the 32-char Web-Store ID from a URL or accept the ID directly. */
export function parseStoreId(input: string): string {
  const trimmed = input.trim();
  if (/^[a-p]{32}$/.test(trimmed)) return trimmed;
  // chromewebstore.google.com/detail/<slug>/<id>?hl=...
  const m = trimmed.match(/[a-p]{32}/);
  if (!m) {
    throw new Error('Invalid Chrome Web Store URL — could not find 32-char extension ID.');
  }
  return m[0];
}

function readManifestName(extDir: string): string | null {
  const manifestPath = join(extDir, 'manifest.json');
  if (!existsSync(manifestPath)) return null;
  try {
    const j = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    if (typeof j.name === 'string' && j.name.trim()) return j.name.trim();
  } catch {
    /* ignore */
  }
  return null;
}

function ensureManifest(extDir: string): void {
  if (!existsSync(join(extDir, 'manifest.json'))) {
    throw new Error(
      'No manifest.json found at the root of the extension. Make sure you point at the extension folder, not its parent.',
    );
  }
}

export function installFromFolder(input: AddExtensionFolderInput): UserExtension {
  if (!existsSync(input.folderPath)) {
    throw new Error(`Folder not found: ${input.folderPath}`);
  }
  const id = nanoid(12);
  const dest = join(extensionsBaseDir(), id);
  mkdirSync(dest, { recursive: true });
  cpSync(input.folderPath, dest, { recursive: true });
  ensureManifest(dest);

  const ext: UserExtension = {
    id,
    name: input.name?.trim() || readManifestName(dest) || basename(input.folderPath),
    source: 'folder',
    sourceRef: input.folderPath,
    extDir: dest,
    addedAt: Date.now(),
  };
  insertExtension(ext);
  return ext;
}

export function installFromZip(input: AddExtensionZipInput): UserExtension {
  if (!existsSync(input.zipPath)) {
    throw new Error(`File not found: ${input.zipPath}`);
  }
  const id = nanoid(12);
  const dest = join(extensionsBaseDir(), id);
  mkdirSync(dest, { recursive: true });

  try {
    // Auto-detect CRX vs ZIP — some users hand us a .crx file (e.g. one
    // they downloaded from the Chrome Web Store but Chrome refused to
    // install). adm-zip can't read CRX directly, but the inner ZIP starts
    // right after the CRX header.
    const raw = readFileSync(input.zipPath);
    const zipBuf = stripCrxHeader(raw);
    if (zipBuf.length === 0 || zipBuf.slice(0, 4).toString('hex') !== '504b0304') {
      // Not a ZIP local-file-header. Try adm-zip directly anyway so it
      // surfaces a more useful error if the file is something else.
      const zip = new AdmZip(input.zipPath);
      zip.extractAllTo(dest, true);
    } else {
      const zip = new AdmZip(zipBuf);
      zip.extractAllTo(dest, true);
    }
  } catch (err) {
    rmSync(dest, { recursive: true, force: true });
    throw new Error(
      `Failed to extract '${basename(input.zipPath)}': ${
        err instanceof Error ? err.message : String(err)
      }. Make sure the file is a valid .zip or .crx of an unpacked extension.`,
    );
  }

  // Some zips wrap the extension in a single top-level folder. If manifest.json
  // is missing at the dest root but exists exactly one level down, hoist it.
  if (!existsSync(join(dest, 'manifest.json'))) {
    const inner = findSingleChildWithManifest(dest);
    if (inner) {
      // Move contents of `inner` up into `dest`.
      cpSync(inner, dest, { recursive: true });
      try {
        rmSync(inner, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  ensureManifest(dest);

  const ext: UserExtension = {
    id,
    name:
      input.name?.trim() ||
      resolveLocalizedName(dest) ||
      readManifestName(dest) ||
      basename(input.zipPath).replace(/\.(zip|crx)$/i, ''),
    source: 'zip',
    sourceRef: input.zipPath,
    extDir: dest,
    addedAt: Date.now(),
  };
  insertExtension(ext);
  return ext;
}

function findSingleChildWithManifest(parentDir: string): string | null {
  const entries = readdirSync(parentDir);
  if (entries.length !== 1) return null;
  const child = join(parentDir, entries[0]!);
  if (!statSync(child).isDirectory()) return null;
  if (existsSync(join(child, 'manifest.json'))) return child;
  return null;
}

export async function installFromStore(input: AddExtensionStoreInput): Promise<UserExtension> {
  const extId = parseStoreId(input.urlOrId);
  const id = nanoid(12);
  const dest = join(extensionsBaseDir(), id);
  mkdirSync(dest, { recursive: true });

  const crxPath = join(extensionsBaseDir(), `${id}.crx`);
  try {
    await downloadCrx(extId, crxPath);
    const zipBuf = stripCrxHeader(readFileSync(crxPath));
    const zip = new AdmZip(zipBuf);
    zip.extractAllTo(dest, true);
  } catch (err) {
    rmSync(dest, { recursive: true, force: true });
    if (existsSync(crxPath)) {
      try {
        rmSync(crxPath, { force: true });
      } catch {
        /* ignore */
      }
    }
    throw new Error(
      `Failed to download/install extension ${extId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  } finally {
    if (existsSync(crxPath)) {
      try {
        rmSync(crxPath, { force: true });
      } catch {
        /* ignore */
      }
    }
  }

  // Web Store CRX manifests sometimes include `_locales/<lang>/messages.json`
  // referenced via __MSG_*__ in `name`. Try to resolve a real human name.
  const resolvedName = resolveLocalizedName(dest);

  ensureManifest(dest);

  const ext: UserExtension = {
    id,
    name: input.name?.trim() || resolvedName || `Extension ${extId.slice(0, 8)}`,
    source: 'store',
    sourceRef: input.urlOrId,
    extDir: dest,
    extId,
    addedAt: Date.now(),
  };
  insertExtension(ext);
  return ext;
}

function resolveLocalizedName(extDir: string): string | null {
  try {
    const raw = JSON.parse(
      readFileSync(join(extDir, 'manifest.json'), 'utf8'),
    ) as Record<string, unknown>;
    const name = typeof raw.name === 'string' ? raw.name : '';
    if (!name.startsWith('__MSG_') || !name.endsWith('__')) return name || null;
    const key = name.slice(6, -2);
    const defaultLocale =
      typeof raw.default_locale === 'string' ? raw.default_locale : 'en';
    const messages = JSON.parse(
      readFileSync(join(extDir, '_locales', defaultLocale, 'messages.json'), 'utf8'),
    ) as Record<string, { message?: string }>;
    return messages[key]?.message ?? null;
  } catch {
    return null;
  }
}

const CHROME_VERSION = '124.0.0.0';

function buildCrxUrl(extId: string): string {
  // Use Chrome's official update endpoint, which 302-redirects to the actual
  // CRX blob hosted on a Google CDN.
  const params = new URLSearchParams({
    response: 'redirect',
    os: 'win',
    arch: 'x86-64',
    os_arch: 'x86_64',
    nacl_arch: 'x86-64',
    prod: 'chromiumcrx',
    prodchannel: 'unknown',
    prodversion: CHROME_VERSION,
    acceptformat: 'crx2,crx3',
    x: `id=${extId}&installsource=ondemand&uc`,
  });
  return `https://clients2.google.com/service/update2/crx?${params.toString()}`;
}

function downloadCrx(extId: string, destPath: string): Promise<void> {
  const url = buildCrxUrl(extId);
  return httpDownload(url, destPath, 6);
}

function httpDownload(url: string, destPath: string, redirectsLeft: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const u = new URL(url);
    const opts: RequestOptions = {
      method: 'GET',
      hostname: u.hostname,
      path: `${u.pathname}${u.search}`,
      headers: {
        'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/${CHROME_VERSION} Safari/537.36`,
        Accept: 'application/x-chrome-extension',
      },
    };
    const req = httpsRequest(opts, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        if (redirectsLeft <= 0) {
          reject(new Error('too many redirects'));
          return;
        }
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        httpDownload(next, destPath, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (status !== 200) {
        reject(new Error(`HTTP ${status}`));
        res.resume();
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        try {
          writeFileSync(destPath, Buffer.concat(chunks));
          resolve();
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

/**
 * Strip the CRX header (CRX2 or CRX3) and return the inner ZIP. Both formats
 * carry a standard ZIP after their signed header.
 *
 *   CRX2: 'Cr24' + version=2 + pubkey_len(4) + sig_len(4) + pubkey + sig + ZIP
 *   CRX3: 'Cr24' + version=3 + header_len(4) + protobuf_header + ZIP
 *
 * Anything not matching is treated as a raw ZIP.
 */
export function stripCrxHeader(buf: Buffer): Buffer {
  if (buf.length < 16) return buf;
  if (buf.slice(0, 4).toString('ascii') !== 'Cr24') return buf;
  const version = buf.readUInt32LE(4);
  if (version === 2) {
    const pubkeyLen = buf.readUInt32LE(8);
    const sigLen = buf.readUInt32LE(12);
    return buf.slice(16 + pubkeyLen + sigLen);
  }
  if (version === 3) {
    const headerLen = buf.readUInt32LE(8);
    return buf.slice(12 + headerLen);
  }
  // Unknown CRX version — fallback: scan for ZIP local-file-header signature.
  const idx = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  return idx >= 0 ? buf.slice(idx) : buf;
}

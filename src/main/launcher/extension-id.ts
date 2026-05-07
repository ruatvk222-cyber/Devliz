import { createHash } from 'node:crypto';

/**
 * Chrome derives the ID of an unpacked extension (one loaded with
 * --load-extension) from a SHA-256 hash of its absolute path.
 *
 * The first 32 hex characters of that hash are then "encoded" by mapping
 * 0..f → a..p — that gives a 32-char extension ID consisting of letters
 * a..p, exactly the form we see in chrome://extensions.
 *
 * This is the same algorithm used by Chromium itself; see
 * extensions/common/extension_id.h and extensions/browser/path_util.h
 * (CrxFile::id_util::GenerateIdForPath). On Windows, base::FilePath stores
 * wchar_t (UTF-16LE) so we must hash the raw 16-bit code units, not UTF-8.
 */
export function extensionIdForPath(absPath: string): string {
  const buf =
    process.platform === 'win32'
      ? Buffer.from(absPath, 'utf16le')
      : Buffer.from(absPath, 'utf8');
  const hash = createHash('sha256').update(buf).digest('hex');
  const first32 = hash.slice(0, 32);
  let id = '';
  for (const ch of first32) {
    const n = parseInt(ch, 16);
    id += String.fromCharCode('a'.charCodeAt(0) + n);
  }
  return id;
}

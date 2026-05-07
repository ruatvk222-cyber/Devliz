import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Pre-write Chrome's `Default/Preferences` JSON before the browser launches,
 * so the user gets:
 *   - `chrome://extensions` opens with **Developer mode** toggled ON.
 *   - The given extension IDs **pinned** to the toolbar (visible icons).
 *
 * This is the same JSON Chrome reads on every startup. We only set the keys
 * we care about and merge into any existing file so we don't clobber
 * cookies / saved passwords / etc.
 *
 * Keys touched:
 *   `extensions.ui.developer_mode` (bool)  — controls the Dev mode toggle.
 *   `extensions.pinned_extensions` (string[]) — IDs Chrome shows on toolbar.
 *   `extensions.toolbar` (string[])           — older alias, set for safety.
 */
export function applyExtensionPrefs(
  userDataDir: string,
  pinnedExtensionIds: string[],
): void {
  const profileDir = join(userDataDir, 'Default');
  mkdirSync(profileDir, { recursive: true });
  const prefsPath = join(profileDir, 'Preferences');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prefs: Record<string, any> = {};
  if (existsSync(prefsPath)) {
    try {
      prefs = JSON.parse(readFileSync(prefsPath, 'utf8')) as Record<string, unknown>;
    } catch {
      prefs = {};
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ext: Record<string, any> = (prefs.extensions =
    typeof prefs.extensions === 'object' && prefs.extensions !== null
      ? prefs.extensions
      : {});

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ui: Record<string, any> = (ext.ui =
    typeof ext.ui === 'object' && ext.ui !== null ? ext.ui : {});
  ui.developer_mode = true;

  const pinSet = new Set<string>([
    ...(Array.isArray(ext.pinned_extensions) ? (ext.pinned_extensions as string[]) : []),
    ...pinnedExtensionIds,
  ]);
  ext.pinned_extensions = Array.from(pinSet);
  // Older Chrome versions read `extensions.toolbar`; keep both in sync so the
  // pin shows up regardless of channel.
  ext.toolbar = Array.from(pinSet);

  writeFileSync(prefsPath, JSON.stringify(prefs));
}

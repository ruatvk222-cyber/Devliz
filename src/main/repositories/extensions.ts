import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import type { UserExtension, UserExtensionSource } from '@shared/types';
import { getDb } from '../db';

interface ExtensionRow {
  id: string;
  name: string;
  source: string;
  source_ref: string | null;
  ext_dir: string;
  ext_id: string | null;
  added_at: number;
}

function rowToExtension(row: ExtensionRow): UserExtension {
  return {
    id: row.id,
    name: row.name,
    source: row.source as UserExtensionSource,
    sourceRef: row.source_ref ?? undefined,
    extDir: row.ext_dir,
    extId: row.ext_id ?? undefined,
    addedAt: row.added_at,
  };
}

export function extensionsBaseDir(): string {
  const dir = join(app.getPath('userData'), 'extensions');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function listExtensions(): UserExtension[] {
  const rows = getDb()
    .prepare('SELECT * FROM user_extensions ORDER BY added_at DESC')
    .all() as ExtensionRow[];
  return rows.map(rowToExtension);
}

export function getExtension(id: string): UserExtension | null {
  const row = getDb()
    .prepare('SELECT * FROM user_extensions WHERE id = ?')
    .get(id) as ExtensionRow | undefined;
  return row ? rowToExtension(row) : null;
}

export function insertExtension(ext: UserExtension): void {
  getDb()
    .prepare(
      `INSERT INTO user_extensions (id, name, source, source_ref, ext_dir, ext_id, added_at)
       VALUES (@id, @name, @source, @sourceRef, @extDir, @extId, @addedAt)`,
    )
    .run({
      id: ext.id,
      name: ext.name,
      source: ext.source,
      sourceRef: ext.sourceRef ?? null,
      extDir: ext.extDir,
      extId: ext.extId ?? null,
      addedAt: ext.addedAt,
    });
}

export function deleteExtension(id: string): void {
  const ext = getExtension(id);
  getDb().prepare('DELETE FROM user_extensions WHERE id = ?').run(id);
  if (ext && existsSync(ext.extDir)) {
    try {
      rmSync(ext.extDir, { recursive: true, force: true });
    } catch {
      /* ignore — the row is gone, leftover bytes are harmless */
    }
  }
}

export function listExtensionsForProfile(profileId: string): UserExtension[] {
  const rows = getDb()
    .prepare(
      `SELECT e.* FROM user_extensions e
       JOIN profile_extensions pe ON pe.extension_id = e.id
       WHERE pe.profile_id = ?
       ORDER BY e.added_at DESC`,
    )
    .all(profileId) as ExtensionRow[];
  return rows.map(rowToExtension);
}

export function attachExtensionToProfiles(
  extensionId: string,
  profileIds: string[],
): void {
  if (profileIds.length === 0) return;
  const stmt = getDb().prepare(
    `INSERT OR IGNORE INTO profile_extensions (profile_id, extension_id) VALUES (?, ?)`,
  );
  const tx = getDb().transaction((batch: string[]) => {
    for (const pid of batch) stmt.run(pid, extensionId);
  });
  tx(profileIds);
}

export function detachExtensionFromProfiles(
  extensionId: string,
  profileIds: string[],
): void {
  if (profileIds.length === 0) return;
  const stmt = getDb().prepare(
    `DELETE FROM profile_extensions WHERE profile_id = ? AND extension_id = ?`,
  );
  const tx = getDb().transaction((batch: string[]) => {
    for (const pid of batch) stmt.run(pid, extensionId);
  });
  tx(profileIds);
}

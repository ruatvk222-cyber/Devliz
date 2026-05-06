import { nanoid } from 'nanoid';
import { app } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { BulkCreateOptions, FingerprintConfig, Profile, ProfileStatus } from '@shared/types';
import { generateFingerprint } from '@shared/fingerprint-pool';
import { getDb } from '../db';
import { getSettings } from './settings';

interface ProfileRow {
  id: string;
  name: string;
  group: string | null;
  tags: string | null;
  notes: string | null;
  start_url: string | null;
  proxy_id: string | null;
  fingerprint_json: string;
  data_dir: string;
  status: string;
  last_launched_at: number | null;
  created_at: number;
  updated_at: number;
}

function rowToProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    group: row.group ?? undefined,
    tags: row.tags ?? undefined,
    notes: row.notes ?? undefined,
    startUrl: row.start_url ?? undefined,
    proxyId: row.proxy_id ?? undefined,
    fingerprint: JSON.parse(row.fingerprint_json) as FingerprintConfig,
    dataDir: row.data_dir,
    status: (row.status as ProfileStatus) ?? 'idle',
    lastLaunchedAt: row.last_launched_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function profilesRoot(): string {
  const settings = getSettings();
  const root = settings.profilesRoot ?? join(app.getPath('userData'), 'profiles');
  mkdirSync(root, { recursive: true });
  return root;
}

export function listProfiles(): Profile[] {
  const rows = getDb().prepare('SELECT * FROM profiles ORDER BY created_at DESC').all() as ProfileRow[];
  return rows.map(rowToProfile);
}

export function getProfile(id: string): Profile | null {
  const row = getDb().prepare('SELECT * FROM profiles WHERE id = ?').get(id) as ProfileRow | undefined;
  return row ? rowToProfile(row) : null;
}

export function createProfile(input: Partial<Profile>): Profile {
  const id = input.id ?? nanoid(12);
  const now = Date.now();
  const fingerprint = input.fingerprint ?? generateFingerprint();
  const dataDir = input.dataDir ?? join(profilesRoot(), id);
  mkdirSync(dataDir, { recursive: true });

  const profile: Profile = {
    id,
    name: input.name ?? `Profile ${id.slice(0, 6)}`,
    group: input.group,
    tags: input.tags,
    notes: input.notes,
    startUrl: input.startUrl,
    proxyId: input.proxyId,
    fingerprint,
    dataDir,
    status: 'idle',
    createdAt: now,
    updatedAt: now,
  };

  getDb()
    .prepare(
      `INSERT INTO profiles (
        id, name, "group", tags, notes, start_url, proxy_id, fingerprint_json,
        data_dir, status, created_at, updated_at
      ) VALUES (
        @id, @name, @group, @tags, @notes, @startUrl, @proxyId, @fingerprintJson,
        @dataDir, @status, @createdAt, @updatedAt
      )`,
    )
    .run({
      id: profile.id,
      name: profile.name,
      group: profile.group ?? null,
      tags: profile.tags ?? null,
      notes: profile.notes ?? null,
      startUrl: profile.startUrl ?? null,
      proxyId: profile.proxyId ?? null,
      fingerprintJson: JSON.stringify(profile.fingerprint),
      dataDir: profile.dataDir,
      status: profile.status,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    });

  return profile;
}

export function bulkCreateProfiles(options: BulkCreateOptions): Profile[] {
  const count = Math.max(1, Math.min(5000, Math.floor(options.count)));
  const created: Profile[] = [];
  const proxyIds = options.proxyIds ?? [];

  const tx = getDb().transaction(() => {
    for (let i = 0; i < count; i++) {
      const proxyId = proxyIds.length > 0 ? proxyIds[i % proxyIds.length] : undefined;
      const osChoice = options.osMix && options.osMix.length > 0 ? options.osMix[i % options.osMix.length] : undefined;
      const fingerprint = generateFingerprint(osChoice);
      const profile = createProfile({
        name: `${options.namePrefix} ${i + 1}`,
        group: options.group,
        startUrl: options.startUrl,
        proxyId,
        fingerprint,
      });
      created.push(profile);
    }
  });
  tx();

  return created;
}

export function updateProfile(id: string, patch: Partial<Profile>): Profile {
  const existing = getProfile(id);
  if (!existing) throw new Error(`Profile ${id} not found`);

  const updated: Profile = {
    ...existing,
    ...patch,
    id: existing.id,
    fingerprint: patch.fingerprint ?? existing.fingerprint,
    updatedAt: Date.now(),
  };

  getDb()
    .prepare(
      `UPDATE profiles SET
        name = @name,
        "group" = @group,
        tags = @tags,
        notes = @notes,
        start_url = @startUrl,
        proxy_id = @proxyId,
        fingerprint_json = @fingerprintJson,
        data_dir = @dataDir,
        status = @status,
        last_launched_at = @lastLaunchedAt,
        updated_at = @updatedAt
       WHERE id = @id`,
    )
    .run({
      id: updated.id,
      name: updated.name,
      group: updated.group ?? null,
      tags: updated.tags ?? null,
      notes: updated.notes ?? null,
      startUrl: updated.startUrl ?? null,
      proxyId: updated.proxyId ?? null,
      fingerprintJson: JSON.stringify(updated.fingerprint),
      dataDir: updated.dataDir,
      status: updated.status,
      lastLaunchedAt: updated.lastLaunchedAt ?? null,
      updatedAt: updated.updatedAt,
    });

  return updated;
}

export function setProfileStatus(id: string, status: ProfileStatus, lastLaunchedAt?: number): void {
  if (lastLaunchedAt !== undefined) {
    getDb()
      .prepare('UPDATE profiles SET status = ?, last_launched_at = ?, updated_at = ? WHERE id = ?')
      .run(status, lastLaunchedAt, Date.now(), id);
  } else {
    getDb()
      .prepare('UPDATE profiles SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, Date.now(), id);
  }
}

export function deleteProfile(id: string): void {
  getDb().prepare('DELETE FROM profiles WHERE id = ?').run(id);
}

export function deleteProfiles(ids: string[]): void {
  const stmt = getDb().prepare('DELETE FROM profiles WHERE id = ?');
  const tx = getDb().transaction((batch: string[]) => {
    for (const id of batch) stmt.run(id);
  });
  tx(ids);
}

export function duplicateProfile(id: string): Profile {
  const src = getProfile(id);
  if (!src) throw new Error(`Profile ${id} not found`);
  return createProfile({
    name: `${src.name} (copy)`,
    group: src.group,
    tags: src.tags,
    notes: src.notes,
    startUrl: src.startUrl,
    proxyId: src.proxyId,
    fingerprint: { ...src.fingerprint },
  });
}

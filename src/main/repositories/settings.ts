import { DEFAULT_APP_SETTINGS, type AppSettings } from '@shared/types';
import { getDb } from '../db';

const SETTINGS_KEY = 'app';

export function getSettings(): AppSettings {
  const row = getDb()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(SETTINGS_KEY) as { value: string } | undefined;
  if (!row) return { ...DEFAULT_APP_SETTINGS };
  try {
    const parsed = JSON.parse(row.value) as Partial<AppSettings>;
    return { ...DEFAULT_APP_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const updated: AppSettings = { ...current, ...patch };
  const value = JSON.stringify(updated);
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(SETTINGS_KEY, value);
  return updated;
}

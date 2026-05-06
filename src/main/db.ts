import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function initDatabase(): Database.Database {
  if (db) return db;

  const userData = app.getPath('userData');
  mkdirSync(userData, { recursive: true });
  const dbPath = join(userData, 'devliz.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS proxies (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      username TEXT,
      password TEXT,
      label TEXT,
      status TEXT,
      last_checked_at INTEGER,
      last_ip TEXT,
      last_country TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      "group" TEXT,
      tags TEXT,
      notes TEXT,
      start_url TEXT,
      proxy_id TEXT REFERENCES proxies(id) ON DELETE SET NULL,
      fingerprint_json TEXT NOT NULL,
      data_dir TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      last_launched_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_profiles_group ON profiles("group");
    CREATE INDEX IF NOT EXISTS idx_profiles_proxy ON profiles(proxy_id);
    CREATE INDEX IF NOT EXISTS idx_profiles_name ON profiles(name);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

import { nanoid } from 'nanoid';
import type { ProxyConfig, ProxyImportOptions, ProxyType } from '@shared/types';
import { getDb } from '../db';

interface ProxyRow {
  id: string;
  type: string;
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  label: string | null;
  status: string | null;
  last_checked_at: number | null;
  last_ip: string | null;
  last_country: string | null;
  created_at: number;
}

function rowToProxy(row: ProxyRow): ProxyConfig {
  return {
    id: row.id,
    type: row.type as ProxyType,
    host: row.host,
    port: row.port,
    username: row.username ?? undefined,
    password: row.password ?? undefined,
    label: row.label ?? undefined,
    status: (row.status as ProxyConfig['status']) ?? 'unknown',
    lastCheckedAt: row.last_checked_at ?? undefined,
    lastIp: row.last_ip ?? undefined,
    lastCountry: row.last_country ?? undefined,
    createdAt: row.created_at,
  };
}

export function listProxies(): ProxyConfig[] {
  const rows = getDb().prepare('SELECT * FROM proxies ORDER BY created_at DESC').all() as ProxyRow[];
  return rows.map(rowToProxy);
}

export function getProxy(id: string): ProxyConfig | null {
  const row = getDb().prepare('SELECT * FROM proxies WHERE id = ?').get(id) as ProxyRow | undefined;
  return row ? rowToProxy(row) : null;
}

export function createProxy(input: Omit<ProxyConfig, 'id' | 'createdAt'>): ProxyConfig {
  const proxy: ProxyConfig = {
    ...input,
    id: nanoid(12),
    createdAt: Date.now(),
    status: input.status ?? 'unknown',
  };
  getDb()
    .prepare(
      `INSERT INTO proxies (id, type, host, port, username, password, label, status, last_checked_at, last_ip, last_country, created_at)
       VALUES (@id, @type, @host, @port, @username, @password, @label, @status, @lastCheckedAt, @lastIp, @lastCountry, @createdAt)`,
    )
    .run({
      id: proxy.id,
      type: proxy.type,
      host: proxy.host,
      port: proxy.port,
      username: proxy.username ?? null,
      password: proxy.password ?? null,
      label: proxy.label ?? null,
      status: proxy.status ?? 'unknown',
      lastCheckedAt: proxy.lastCheckedAt ?? null,
      lastIp: proxy.lastIp ?? null,
      lastCountry: proxy.lastCountry ?? null,
      createdAt: proxy.createdAt,
    });
  return proxy;
}

export function updateProxy(id: string, patch: Partial<ProxyConfig>): ProxyConfig {
  const existing = getProxy(id);
  if (!existing) throw new Error(`Proxy ${id} not found`);
  const updated: ProxyConfig = { ...existing, ...patch, id: existing.id };
  getDb()
    .prepare(
      `UPDATE proxies SET
        type = @type, host = @host, port = @port, username = @username,
        password = @password, label = @label, status = @status,
        last_checked_at = @lastCheckedAt, last_ip = @lastIp, last_country = @lastCountry
       WHERE id = @id`,
    )
    .run({
      id: updated.id,
      type: updated.type,
      host: updated.host,
      port: updated.port,
      username: updated.username ?? null,
      password: updated.password ?? null,
      label: updated.label ?? null,
      status: updated.status ?? 'unknown',
      lastCheckedAt: updated.lastCheckedAt ?? null,
      lastIp: updated.lastIp ?? null,
      lastCountry: updated.lastCountry ?? null,
    });
  return updated;
}

export function deleteProxy(id: string): void {
  getDb().prepare('DELETE FROM proxies WHERE id = ?').run(id);
}

/**
 * Parse a single proxy line. Supports:
 * - ip:port
 * - ip:port:user:pass
 * - scheme://user:pass@ip:port
 * - scheme://ip:port
 */
export function parseProxyLine(line: string, defaultType: ProxyType): Omit<ProxyConfig, 'id' | 'createdAt'> | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const schemeMatch = trimmed.match(/^(http|https|socks4|socks5):\/\/(.+)$/i);
  let type: ProxyType = defaultType === 'none' ? 'http' : defaultType;
  let body = trimmed;
  if (schemeMatch) {
    type = schemeMatch[1]!.toLowerCase() as ProxyType;
    body = schemeMatch[2]!;
  }

  let username: string | undefined;
  let password: string | undefined;
  if (body.includes('@')) {
    const [auth, rest] = body.split('@');
    body = rest!;
    const idx = auth!.indexOf(':');
    if (idx >= 0) {
      username = auth!.slice(0, idx);
      password = auth!.slice(idx + 1);
    } else {
      username = auth!;
    }
  }

  const parts = body.split(':');
  if (parts.length < 2) return null;
  const host = parts[0]!;
  const port = Number(parts[1]);
  if (!host || !Number.isFinite(port) || port <= 0) return null;
  if (parts.length >= 4 && username === undefined) {
    username = parts[2];
    password = parts[3];
  }

  return { type, host, port, username, password };
}

export function importProxies(options: ProxyImportOptions): ProxyConfig[] {
  const lines = options.text.split(/\r?\n/);
  const created: ProxyConfig[] = [];
  const tx = getDb().transaction(() => {
    for (const line of lines) {
      const parsed = parseProxyLine(line, options.defaultType);
      if (parsed) created.push(createProxy(parsed));
    }
  });
  tx();
  return created;
}

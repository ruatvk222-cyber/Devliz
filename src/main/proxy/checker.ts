import { Agent, fetch as undiciFetch } from 'undici';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import type { ProxyCheckResult, ProxyConfig } from '@shared/types';
import { listProxies, updateProxy } from '../repositories/proxies';

const CHECK_URL = 'https://api.ipify.org/?format=json';
const GEO_URL = 'https://ipwho.is/';
const TIMEOUT_MS = 10_000;

function buildAgent(proxy: ProxyConfig): Agent | HttpsProxyAgent<string> | SocksProxyAgent | null {
  if (proxy.type === 'none') return new Agent();
  const auth = proxy.username ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password ?? '')}@` : '';
  const url = `${proxy.type}://${auth}${proxy.host}:${proxy.port}`;
  if (proxy.type === 'http' || proxy.type === 'https') {
    return new HttpsProxyAgent(url);
  }
  if (proxy.type === 'socks4' || proxy.type === 'socks5') {
    return new SocksProxyAgent(url);
  }
  return null;
}

async function fetchWithTimeout(url: string, agent: unknown): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // undiciFetch signature accepts dispatcher; types differ for proxy-agent libs.
    const res = await undiciFetch(url, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dispatcher: agent as any,
      signal: controller.signal,
    });
    return res as unknown as Response;
  } finally {
    clearTimeout(t);
  }
}

export async function checkProxy(proxyId: string): Promise<ProxyCheckResult> {
  const proxies = listProxies();
  const proxy = proxies.find((p) => p.id === proxyId);
  if (!proxy) return { id: proxyId, ok: false, error: 'proxy not found' };

  const agent = buildAgent(proxy);
  if (!agent) return { id: proxyId, ok: false, error: 'unsupported proxy type' };

  const start = Date.now();
  try {
    const res = await fetchWithTimeout(CHECK_URL, agent);
    if (!res.ok) {
      const result: ProxyCheckResult = { id: proxyId, ok: false, error: `HTTP ${res.status}` };
      updateProxy(proxyId, { status: 'dead', lastCheckedAt: Date.now() });
      return result;
    }
    const json = (await res.json()) as { ip?: string };
    const latencyMs = Date.now() - start;
    let country: string | undefined;
    try {
      const geoRes = await fetchWithTimeout(`${GEO_URL}${json.ip ?? ''}`, agent);
      if (geoRes.ok) {
        const geo = (await geoRes.json()) as { country?: string; country_code?: string };
        country = geo.country_code ?? geo.country;
      }
    } catch {
      /* geo is best-effort */
    }
    updateProxy(proxyId, {
      status: 'live',
      lastCheckedAt: Date.now(),
      lastIp: json.ip,
      lastCountry: country,
    });
    return { id: proxyId, ok: true, ip: json.ip, country, latencyMs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateProxy(proxyId, { status: 'dead', lastCheckedAt: Date.now() });
    return { id: proxyId, ok: false, error: message };
  }
}

export async function checkProxies(
  ids: string[],
  onProgress?: (r: ProxyCheckResult) => void,
  concurrency = 10,
): Promise<ProxyCheckResult[]> {
  const queue = [...ids];
  const results: ProxyCheckResult[] = [];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) return;
      const r = await checkProxy(id);
      results.push(r);
      if (onProgress) onProgress(r);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

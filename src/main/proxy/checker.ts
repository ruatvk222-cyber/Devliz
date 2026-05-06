import http from 'node:http';
import https from 'node:https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import type { ProxyCheckResult, ProxyConfig } from '@shared/types';
import { listProxies, updateProxy } from '../repositories/proxies';

const CHECK_URL = 'https://api.ipify.org/?format=json';
const GEO_URL = 'http://ip-api.com/json/';
const TIMEOUT_MS = 12_000;

type ProxyAgent = HttpsProxyAgent<string> | SocksProxyAgent | undefined;

function buildAgent(proxy: ProxyConfig): ProxyAgent {
  if (proxy.type === 'none') return undefined;
  const auth = proxy.username
    ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password ?? '')}@`
    : '';
  const url = `${proxy.type}://${auth}${proxy.host}:${proxy.port}`;
  if (proxy.type === 'http' || proxy.type === 'https') return new HttpsProxyAgent(url);
  if (proxy.type === 'socks4' || proxy.type === 'socks5') return new SocksProxyAgent(url);
  return undefined;
}

interface FetchResult {
  status: number;
  body: string;
}

function fetchJsonViaAgent(targetUrl: string, agent: ProxyAgent, timeoutMs: number): Promise<FetchResult> {
  return new Promise<FetchResult>((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(targetUrl);
    } catch (err) {
      reject(err);
      return;
    }
    const lib = url.protocol === 'https:' ? https : http;

    const req = lib.request(
      {
        method: 'GET',
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        agent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Devliz/0.1; +https://github.com/ruatvk222-cyber/Devliz)',
          Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
        res.on('error', reject);
      },
    );

    const timer = setTimeout(() => {
      req.destroy(new Error(`timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.on('close', () => clearTimeout(timer));

    req.end();
  });
}

function safeParseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function checkProxy(proxyId: string): Promise<ProxyCheckResult> {
  const proxies = listProxies();
  const proxy = proxies.find((p) => p.id === proxyId);
  if (!proxy) return { id: proxyId, ok: false, error: 'proxy not found' };

  let agent: ProxyAgent;
  try {
    agent = buildAgent(proxy);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateProxy(proxyId, { status: 'dead', lastCheckedAt: Date.now() });
    return { id: proxyId, ok: false, error: `bad proxy URL: ${msg}` };
  }

  if (!agent && proxy.type !== 'none') {
    updateProxy(proxyId, { status: 'dead', lastCheckedAt: Date.now() });
    return { id: proxyId, ok: false, error: `unsupported proxy type: ${proxy.type}` };
  }

  const start = Date.now();
  try {
    const ipRes = await fetchJsonViaAgent(CHECK_URL, agent, TIMEOUT_MS);
    if (ipRes.status < 200 || ipRes.status >= 300) {
      updateProxy(proxyId, { status: 'dead', lastCheckedAt: Date.now() });
      return { id: proxyId, ok: false, error: `HTTP ${ipRes.status}: ${ipRes.body.slice(0, 120)}` };
    }
    const ipJson = safeParseJson<{ ip?: string }>(ipRes.body);
    const ip = ipJson?.ip;
    const latencyMs = Date.now() - start;

    let country: string | undefined;
    if (ip) {
      try {
        const geoRes = await fetchJsonViaAgent(`${GEO_URL}${ip}`, agent, TIMEOUT_MS);
        if (geoRes.status >= 200 && geoRes.status < 300) {
          const geo = safeParseJson<{ country?: string; countryCode?: string }>(geoRes.body);
          country = geo?.countryCode ?? geo?.country;
        }
      } catch {
        /* geo lookup is best-effort */
      }
    }

    updateProxy(proxyId, {
      status: 'live',
      lastCheckedAt: Date.now(),
      lastIp: ip,
      lastCountry: country,
    });
    return { id: proxyId, ok: true, ip, country, latencyMs };
  } catch (err) {
    let message = err instanceof Error ? err.message : String(err);
    // Surface common errors more clearly.
    if (/ECONNREFUSED/.test(message)) message = 'connection refused';
    else if (/ETIMEDOUT|timeout/i.test(message)) message = 'timeout';
    else if (/ENOTFOUND|EAI_AGAIN/.test(message)) message = `cannot resolve host (${proxy.host})`;
    else if (/407/.test(message)) message = 'authentication failed (HTTP 407)';
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

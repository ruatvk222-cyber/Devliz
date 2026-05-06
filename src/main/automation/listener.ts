import http, { type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';

/**
 * Local HTTP listener that bundled extensions POST progress events to.
 *
 * Bound to 127.0.0.1:0 (random free port) so it is only reachable from this
 * machine. Each registered token maps to a callback that fires when the
 * automation reports a terminal phase (finished / no-unread / error /
 * stopped).
 */

export type AutomationEventPhase =
  | 'bootstrap'
  | 'started'
  | 'opening'
  | 'reading'
  | 'done-item'
  | 'finished'
  | 'no-unread'
  | 'error'
  | 'stopped';

export interface AutomationEvent {
  token: string;
  phase: AutomationEventPhase;
  detail?: unknown;
}

export type AutomationCallback = (event: AutomationEvent) => void;

interface ListenerHandle {
  server: Server;
  port: number;
}

let listener: ListenerHandle | null = null;
const callbacks = new Map<string, AutomationCallback>();

const TERMINAL_PHASES = new Set<AutomationEventPhase>([
  'finished',
  'no-unread',
  'error',
  'stopped',
]);

function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      total += chunk.length;
      if (total > 64 * 1024) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function handle(req: IncomingMessage, res: ServerResponse): void {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }
  if (req.method !== 'POST' || !req.url || !req.url.startsWith('/automation/event')) {
    res.writeHead(404, corsHeaders());
    res.end();
    return;
  }

  void readBody(req)
    .then((body) => {
      let parsed: AutomationEvent | null = null;
      try {
        parsed = JSON.parse(body) as AutomationEvent;
      } catch {
        res.writeHead(400, corsHeaders());
        res.end('invalid json');
        return;
      }
      if (!parsed || typeof parsed.token !== 'string' || typeof parsed.phase !== 'string') {
        res.writeHead(400, corsHeaders());
        res.end('missing fields');
        return;
      }
      const cb = callbacks.get(parsed.token);
      res.writeHead(204, corsHeaders());
      res.end();
      if (cb) {
        try {
          cb(parsed);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[automation] callback threw:', err);
        }
        if (TERMINAL_PHASES.has(parsed.phase)) {
          callbacks.delete(parsed.token);
        }
      }
    })
    .catch(() => {
      try {
        res.writeHead(400, corsHeaders());
        res.end('read error');
      } catch {
        /* ignore */
      }
    });
}

function ensureListener(): Promise<ListenerHandle> {
  if (listener) return Promise.resolve(listener);
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => handle(req, res));
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (typeof addr === 'object' && addr) {
        listener = { server, port: addr.port };
        resolve(listener);
      } else {
        reject(new Error('failed to bind automation listener'));
      }
    });
  });
}

export interface AutomationRegistration {
  token: string;
  webhookUrl: string;
  unregister: () => void;
}

export async function registerAutomation(
  callback: AutomationCallback,
): Promise<AutomationRegistration> {
  const handle = await ensureListener();
  const token = randomBytes(16).toString('hex');
  callbacks.set(token, callback);
  return {
    token,
    webhookUrl: `http://127.0.0.1:${handle.port}/automation/event`,
    unregister: () => {
      callbacks.delete(token);
    },
  };
}

export function shutdownListener(): void {
  callbacks.clear();
  if (listener) {
    try {
      listener.server.close();
    } catch {
      /* ignore */
    }
    listener = null;
  }
}

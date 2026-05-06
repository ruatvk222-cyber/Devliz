import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { connect as netConnect, type Socket } from 'node:net';
import type { ProxyConfig } from '@shared/types';

/**
 * A short-lived local HTTP forwarding proxy that bridges Chrome to an upstream
 * HTTP/HTTPS proxy that requires Basic auth. Chrome's `--proxy-server=` flag
 * does NOT honor inline credentials for http(s) proxies (it strips
 * `user:pass@` and prompts the user instead). So we bind a tiny CONNECT proxy
 * on 127.0.0.1 with no auth, and have it inject the upstream's
 * `Proxy-Authorization` header on the user's behalf.
 *
 * Usage:
 *   const handle = await startAuthProxy(upstream);
 *   spawn(chrome, [`--proxy-server=http://127.0.0.1:${handle.port}`, ...]);
 *   // when Chrome exits:
 *   await handle.close();
 */
export interface AuthProxyHandle {
  port: number;
  upstream: ProxyConfig;
  close(): Promise<void>;
}

export function authProxyApplies(p: ProxyConfig | null | undefined): boolean {
  if (!p) return false;
  if (!p.username) return false;
  return p.type === 'http' || p.type === 'https';
}

export async function startAuthProxy(upstream: ProxyConfig): Promise<AuthProxyHandle> {
  if (!authProxyApplies(upstream)) {
    throw new Error(`startAuthProxy: not applicable for ${upstream.type} (auth=${!!upstream.username})`);
  }

  const authHeader =
    'Basic ' +
    Buffer.from(`${upstream.username ?? ''}:${upstream.password ?? ''}`).toString('base64');

  const server: Server = createServer();

  // HTTPS tunneling — the common case for almost all real traffic.
  server.on('connect', (req: IncomingMessage, clientSocket: Socket, head: Buffer) => {
    clientSocket.on('error', () => {
      /* swallow ECONNRESET */
    });

    const target = req.url ?? '';
    if (!target.includes(':')) {
      clientSocket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }

    const upstreamSocket = netConnect(upstream.port, upstream.host);
    upstreamSocket.on('error', () => {
      try {
        clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      } catch {
        /* ignore */
      }
    });

    upstreamSocket.once('connect', () => {
      const lines = [
        `CONNECT ${target} HTTP/1.1`,
        `Host: ${target}`,
        `Proxy-Authorization: ${authHeader}`,
        'Proxy-Connection: keep-alive',
        '',
        '',
      ];
      upstreamSocket.write(lines.join('\r\n'));
    });

    let buffered = Buffer.alloc(0);
    const onUpstreamData = (chunk: Buffer): void => {
      buffered = Buffer.concat([buffered, chunk]);
      const idx = buffered.indexOf('\r\n\r\n');
      if (idx < 0) return;
      upstreamSocket.removeListener('data', onUpstreamData);

      const headerBlock = buffered.slice(0, idx).toString();
      const firstLine = headerBlock.split('\r\n')[0] ?? '';
      const m = firstLine.match(/^HTTP\/\d\.\d\s+(\d+)/);
      const status = m ? Number(m[1]) : 0;

      if (status >= 200 && status < 300) {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        const leftover = buffered.slice(idx + 4);
        if (leftover.length > 0) clientSocket.write(leftover);
        if (head && head.length > 0) upstreamSocket.write(head);
        upstreamSocket.pipe(clientSocket);
        clientSocket.pipe(upstreamSocket);
      } else {
        // Pass upstream's error (e.g. 407 if creds were wrong) back so callers
        // can debug. Chrome will surface it as a network error rather than
        // re-prompting because we don't bubble up a 407 to it.
        try {
          clientSocket.end('HTTP/1.1 502 Bad Gateway (upstream ' + status + ')\r\n\r\n');
        } catch {
          /* ignore */
        }
        upstreamSocket.end();
      }
    };
    upstreamSocket.on('data', onUpstreamData);
  });

  // Plain HTTP forwarding — uncommon but kept for completeness.
  server.on('request', (req: IncomingMessage, res: ServerResponse) => {
    const upstreamSocket = netConnect(upstream.port, upstream.host);
    upstreamSocket.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      try {
        res.end();
      } catch {
        /* ignore */
      }
    });
    upstreamSocket.once('connect', () => {
      const fullUrl = req.url?.startsWith('http')
        ? req.url
        : `http://${req.headers.host ?? ''}${req.url ?? ''}`;
      const headerLines: string[] = [`${req.method ?? 'GET'} ${fullUrl} HTTP/1.1`];
      for (const [k, v] of Object.entries(req.headers)) {
        if (k.toLowerCase() === 'proxy-authorization') continue;
        if (Array.isArray(v)) {
          for (const item of v) headerLines.push(`${k}: ${item}`);
        } else if (typeof v === 'string') {
          headerLines.push(`${k}: ${v}`);
        }
      }
      headerLines.push(`Proxy-Authorization: ${authHeader}`);
      upstreamSocket.write(headerLines.join('\r\n') + '\r\n\r\n');
      req.pipe(upstreamSocket);
      const sock = res.socket;
      if (sock) {
        upstreamSocket.pipe(sock);
      } else {
        upstreamSocket.end();
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error): void => {
      server.removeListener('listening', onListening);
      reject(err);
    };
    const onListening = (): void => {
      server.removeListener('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });

  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    server.close();
    throw new Error('startAuthProxy: failed to read bound port');
  }

  return {
    port: addr.port,
    upstream,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

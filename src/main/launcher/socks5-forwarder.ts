import { createServer, connect as netConnect, type Server, type Socket } from 'node:net';
import type { ProxyConfig } from '@shared/types';

/**
 * Local SOCKS5 forwarder. Chrome's `--proxy-server=socks5://...` flag does NOT
 * support inline credentials — passing `socks5://user:pass@host:port` results
 * in `ERR_NO_SUPPORTED_PROXIES` because Chrome can't perform the SOCKS5
 * username/password sub-negotiation (RFC 1929) that way.
 *
 * To work around it, we bind a tiny SOCKS5 server on 127.0.0.1 that accepts
 * **no auth** from Chrome, and for every inbound CONNECT we dial the upstream
 * SOCKS5 proxy doing the full RFC 1928 + RFC 1929 handshake (with the
 * username and password). Once the upstream returns success, we pipe both
 * sockets bi-directionally.
 *
 * Only `CONNECT` (0x01) is implemented. UDP_ASSOCIATE / BIND aren't used by
 * Chrome and would meaningfully complicate this file.
 */

export interface Socks5ForwarderHandle {
  port: number;
  upstream: ProxyConfig;
  close(): Promise<void>;
}

export function socks5ForwarderApplies(p: ProxyConfig | null | undefined): boolean {
  if (!p) return false;
  if (!p.username) return false;
  return p.type === 'socks5';
}

export async function startSocks5Forwarder(
  upstream: ProxyConfig,
): Promise<Socks5ForwarderHandle> {
  if (!socks5ForwarderApplies(upstream)) {
    throw new Error(
      `startSocks5Forwarder: not applicable for ${upstream.type} (auth=${!!upstream.username})`,
    );
  }

  const server: Server = createServer((client) => {
    handleClient(client, upstream).catch(() => {
      try {
        client.destroy();
      } catch {
        /* ignore */
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
    throw new Error('startSocks5Forwarder: failed to read bound port');
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

async function handleClient(client: Socket, upstream: ProxyConfig): Promise<void> {
  client.on('error', () => {
    /* swallow */
  });

  // 1) Greeting from Chrome: VER NMETHODS METHODS...
  const greet = await readBytesAtLeast(client, 2);
  if (greet[0] !== 0x05) {
    client.destroy();
    return;
  }
  const nmethods = greet[1] ?? 0;
  await readBytesAtLeast(client, 2 + nmethods, greet);
  // We accept any client; reply with NO AUTH (0x00). Chrome will only ever
  // send 0x00 to a 127.0.0.1 SOCKS5 endpoint anyway.
  client.write(Buffer.from([0x05, 0x00]));

  // 2) Connect request: VER CMD RSV ATYP DST.ADDR DST.PORT
  let req = await readBytesAtLeast(client, 4);
  if (req[0] !== 0x05 || req[1] !== 0x01) {
    // Not a CONNECT — reply "command not supported" (0x07).
    client.end(
      Buffer.from([0x05, 0x07, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    );
    return;
  }
  const atyp = req[3];
  let needed: number;
  if (atyp === 0x01) {
    needed = 4 + 4 + 2; // VER+CMD+RSV+ATYP + IPv4 + PORT
  } else if (atyp === 0x03) {
    if (req.length < 5) req = await readBytesAtLeast(client, 5, req);
    const dlen = req[4] ?? 0;
    needed = 4 + 1 + dlen + 2;
  } else if (atyp === 0x04) {
    needed = 4 + 16 + 2;
  } else {
    client.end(
      Buffer.from([0x05, 0x08, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    );
    return;
  }
  if (req.length < needed) req = await readBytesAtLeast(client, needed, req);

  let host: string;
  let port: number;
  if (atyp === 0x01) {
    host = `${req[4]}.${req[5]}.${req[6]}.${req[7]}`;
    port = ((req[8] ?? 0) << 8) | (req[9] ?? 0);
  } else if (atyp === 0x03) {
    const dlen = req[4] ?? 0;
    host = req.slice(5, 5 + dlen).toString('ascii');
    const po = 5 + dlen;
    port = ((req[po] ?? 0) << 8) | (req[po + 1] ?? 0);
  } else {
    // IPv6
    const parts: string[] = [];
    for (let i = 0; i < 16; i += 2) {
      parts.push(
        (((req[4 + i] ?? 0) << 8) | (req[5 + i] ?? 0))
          .toString(16),
      );
    }
    host = parts.join(':');
    port = ((req[20] ?? 0) << 8) | (req[21] ?? 0);
  }

  // 3) Dial upstream SOCKS5 with user/pass auth.
  let upSock: Socket;
  try {
    upSock = await dialUpstream(upstream, host, port);
  } catch {
    // 0x01 general SOCKS server failure.
    try {
      client.end(
        Buffer.from([0x05, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      );
    } catch {
      /* ignore */
    }
    return;
  }

  // Tell Chrome "succeeded" with a stub bound address (0.0.0.0:0). Chrome
  // doesn't validate this for outbound CONNECT.
  client.write(
    Buffer.from([0x05, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  );

  upSock.on('error', () => {
    try {
      client.destroy();
    } catch {
      /* ignore */
    }
  });
  client.on('close', () => upSock.destroy());
  upSock.on('close', () => client.destroy());
  upSock.pipe(client);
  client.pipe(upSock);
}

async function dialUpstream(
  upstream: ProxyConfig,
  host: string,
  port: number,
): Promise<Socket> {
  const sock = netConnect(upstream.port, upstream.host);
  sock.on('error', () => {
    /* surfaced via promise rejection below */
  });
  await new Promise<void>((resolve, reject) => {
    sock.once('connect', () => resolve());
    sock.once('error', reject);
  });

  // 1) Greeting: NMETHODS=2, methods = NO_AUTH(0x00) + USER_PASS(0x02)
  sock.write(Buffer.from([0x05, 0x02, 0x00, 0x02]));
  const reply = await readBytesAtLeast(sock, 2);
  if (reply[0] !== 0x05) throw new Error('upstream: not SOCKS5');
  const method = reply[1];
  if (method === 0x02) {
    // 2) User/pass sub-negotiation (RFC 1929)
    const u = Buffer.from(upstream.username ?? '', 'utf8');
    const p = Buffer.from(upstream.password ?? '', 'utf8');
    if (u.length > 255 || p.length > 255) {
      throw new Error('upstream: credentials too long');
    }
    const auth = Buffer.concat([
      Buffer.from([0x01, u.length]),
      u,
      Buffer.from([p.length]),
      p,
    ]);
    sock.write(auth);
    const ar = await readBytesAtLeast(sock, 2);
    if (ar[0] !== 0x01 || ar[1] !== 0x00) {
      throw new Error('upstream: auth failed');
    }
  } else if (method !== 0x00) {
    throw new Error(`upstream: unsupported method 0x${(method ?? 0).toString(16)}`);
  }

  // 3) CONNECT request — encode dest as domain (ATYP=0x03) which works for
  // both IPv4-literal and hostnames. The upstream resolves it.
  const hb = Buffer.from(host, 'ascii');
  if (hb.length > 255) throw new Error('upstream: host too long');
  const reqBuf = Buffer.concat([
    Buffer.from([0x05, 0x01, 0x00, 0x03, hb.length]),
    hb,
    Buffer.from([(port >> 8) & 0xff, port & 0xff]),
  ]);
  sock.write(reqBuf);

  const head = await readBytesAtLeast(sock, 4);
  if (head[0] !== 0x05) throw new Error('upstream: not SOCKS5 reply');
  if (head[1] !== 0x00) throw new Error(`upstream: connect failed (rep=${head[1]})`);
  // Drain BND.ADDR + BND.PORT so the socket is at the start of payload.
  const atyp = head[3];
  let drainNeeded: number;
  if (atyp === 0x01) drainNeeded = 4 + 2;
  else if (atyp === 0x04) drainNeeded = 16 + 2;
  else if (atyp === 0x03) {
    const len = await readBytesAtLeast(sock, 1);
    drainNeeded = (len[0] ?? 0) + 2;
  } else {
    throw new Error('upstream: unknown ATYP in reply');
  }
  await readBytesAtLeast(sock, drainNeeded);
  return sock;
}

/**
 * Read until at least `n` bytes have been seen on the socket, returning the
 * accumulated buffer. If `existing` is provided it counts toward `n` first
 * (useful when we previously peeked at a header).
 */
function readBytesAtLeast(sock: Socket, n: number, existing?: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    let buf = existing ?? Buffer.alloc(0);
    if (buf.length >= n) {
      resolve(buf);
      return;
    }
    const onData = (chunk: Buffer): void => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length >= n) {
        sock.removeListener('data', onData);
        sock.removeListener('error', onError);
        sock.removeListener('end', onEnd);
        resolve(buf);
      }
    };
    const onError = (err: Error): void => {
      sock.removeListener('data', onData);
      sock.removeListener('end', onEnd);
      reject(err);
    };
    const onEnd = (): void => {
      sock.removeListener('data', onData);
      sock.removeListener('error', onError);
      reject(new Error('socket closed before all bytes read'));
    };
    sock.on('data', onData);
    sock.once('error', onError);
    sock.once('end', onEnd);
  });
}

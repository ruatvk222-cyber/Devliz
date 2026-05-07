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

/**
 * Stateful reader: consumes exactly N bytes from a socket, buffering any
 * extra bytes that came in the same TCP chunk so the next read picks them
 * up. Without this you lose the tail end of a multi-field SOCKS5 reply
 * (the dial would hang waiting for bytes that already arrived).
 */
class SocketReader {
  private buf = Buffer.alloc(0);
  private want: { n: number; resolve(b: Buffer): void; reject(e: Error): void } | null = null;
  private err: Error | null = null;
  private ended = false;
  private readonly onData = (chunk: Buffer): void => {
    this.buf = Buffer.concat([this.buf, chunk]);
    this.tryFulfil();
  };
  private readonly onError = (err: Error): void => {
    this.err = err;
    if (this.want) {
      const w = this.want;
      this.want = null;
      w.reject(err);
    }
  };
  private readonly onEnd = (): void => {
    this.ended = true;
    if (this.want && this.buf.length < this.want.n) {
      const w = this.want;
      this.want = null;
      w.reject(new Error('socket closed before all bytes read'));
    }
  };

  constructor(private readonly sock: Socket) {
    sock.on('data', this.onData);
    sock.on('error', this.onError);
    sock.on('end', this.onEnd);
  }

  read(n: number): Promise<Buffer> {
    if (this.err) return Promise.reject(this.err);
    if (this.want) return Promise.reject(new Error('SocketReader: concurrent read'));
    if (this.buf.length >= n) {
      const out = this.buf.subarray(0, n);
      this.buf = this.buf.subarray(n);
      return Promise.resolve(Buffer.from(out));
    }
    if (this.ended) return Promise.reject(new Error('socket closed before all bytes read'));
    return new Promise<Buffer>((resolve, reject) => {
      this.want = { n, resolve, reject };
    });
  }

  /**
   * Detach the reader from the socket and return any bytes that were
   * already buffered but not yet consumed. The caller is now responsible
   * for the socket's data flow (typically via `pipe`).
   */
  detach(): Buffer {
    this.sock.removeListener('data', this.onData);
    this.sock.removeListener('error', this.onError);
    this.sock.removeListener('end', this.onEnd);
    const tail = this.buf;
    this.buf = Buffer.alloc(0);
    return tail;
  }

  private tryFulfil(): void {
    if (!this.want) return;
    if (this.buf.length < this.want.n) return;
    const w = this.want;
    this.want = null;
    const out = this.buf.subarray(0, w.n);
    this.buf = this.buf.subarray(w.n);
    w.resolve(Buffer.from(out));
  }
}

async function handleClient(client: Socket, upstream: ProxyConfig): Promise<void> {
  client.on('error', () => {
    /* swallow */
  });

  const cr = new SocketReader(client);
  let upSock: Socket | undefined;
  let upTail: Buffer = Buffer.alloc(0);

  try {
    // 1) Greeting from Chrome: VER NMETHODS METHODS...
    const greetHead = await cr.read(2);
    if (greetHead[0] !== 0x05) {
      cr.detach();
      client.destroy();
      return;
    }
    const nmethods = greetHead[1] ?? 0;
    if (nmethods > 0) await cr.read(nmethods);
    // We accept any client with NO AUTH (0x00). Chrome only ever sends 0x00
    // to a 127.0.0.1 SOCKS5 endpoint anyway.
    client.write(Buffer.from([0x05, 0x00]));

    // 2) Connect request: VER CMD RSV ATYP ...
    const reqHead = await cr.read(4);
    if (reqHead[0] !== 0x05 || reqHead[1] !== 0x01) {
      // Not a CONNECT — reply "command not supported" (0x07).
      client.end(
        Buffer.from([0x05, 0x07, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      );
      cr.detach();
      return;
    }
    const atyp = reqHead[3];
    let host: string;
    let port: number;
    if (atyp === 0x01) {
      const v4 = await cr.read(4);
      const portBuf = await cr.read(2);
      host = `${v4[0]}.${v4[1]}.${v4[2]}.${v4[3]}`;
      port = ((portBuf[0] ?? 0) << 8) | (portBuf[1] ?? 0);
    } else if (atyp === 0x03) {
      const lenBuf = await cr.read(1);
      const dlen = lenBuf[0] ?? 0;
      const hostBuf = await cr.read(dlen);
      const portBuf = await cr.read(2);
      host = hostBuf.toString('ascii');
      port = ((portBuf[0] ?? 0) << 8) | (portBuf[1] ?? 0);
    } else if (atyp === 0x04) {
      const v6 = await cr.read(16);
      const portBuf = await cr.read(2);
      const parts: string[] = [];
      for (let i = 0; i < 16; i += 2) {
        parts.push((((v6[i] ?? 0) << 8) | (v6[i + 1] ?? 0)).toString(16));
      }
      host = parts.join(':');
      port = ((portBuf[0] ?? 0) << 8) | (portBuf[1] ?? 0);
    } else {
      client.end(
        Buffer.from([0x05, 0x08, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      );
      cr.detach();
      return;
    }

    // 3) Dial upstream SOCKS5 with user/pass auth.
    try {
      const dialed = await dialUpstream(upstream, host, port);
      upSock = dialed.sock;
      upTail = dialed.tail;
    } catch {
      try {
        client.end(
          Buffer.from([0x05, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
        );
      } catch {
        /* ignore */
      }
      cr.detach();
      return;
    }

    // Tell Chrome "succeeded" with a stub bound address (0.0.0.0:0). Chrome
    // doesn't validate this for outbound CONNECT.
    client.write(
      Buffer.from([0x05, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    );
  } catch {
    try {
      client.destroy();
    } catch {
      /* ignore */
    }
    if (upSock) {
      try {
        upSock.destroy();
      } catch {
        /* ignore */
      }
    }
    return;
  }

  // Hand the sockets off to plain stream-piping.
  const clientTail = cr.detach();
  if (!upSock) {
    client.destroy();
    return;
  }
  const up = upSock;

  up.on('error', () => {
    try {
      client.destroy();
    } catch {
      /* ignore */
    }
  });
  client.on('close', () => up.destroy());
  up.on('close', () => client.destroy());

  // Forward any bytes that were already received but not yet consumed
  // during the handshake. (e.g. if a SOCKS5 reply arrived in the same
  // TCP chunk as some payload — rare but possible.)
  if (upTail.length > 0) client.write(upTail);
  if (clientTail.length > 0) up.write(clientTail);

  up.pipe(client);
  client.pipe(up);
}

interface DialResult {
  sock: Socket;
  tail: Buffer;
}

async function dialUpstream(
  upstream: ProxyConfig,
  host: string,
  port: number,
): Promise<DialResult> {
  const sock = netConnect(upstream.port, upstream.host);
  // Errors before we attach the SocketReader.
  let earlyErr: Error | null = null;
  const earlyOnError = (err: Error): void => {
    earlyErr = err;
  };
  sock.on('error', earlyOnError);

  await new Promise<void>((resolve, reject) => {
    const onConnect = (): void => {
      sock.removeListener('error', onErr);
      resolve();
    };
    const onErr = (err: Error): void => {
      sock.removeListener('connect', onConnect);
      reject(err);
    };
    sock.once('connect', onConnect);
    sock.once('error', onErr);
  });
  if (earlyErr) {
    sock.destroy();
    throw earlyErr;
  }
  sock.removeListener('error', earlyOnError);

  const r = new SocketReader(sock);

  try {
    // 1) Greeting: NMETHODS=2, methods = NO_AUTH(0x00) + USER_PASS(0x02)
    sock.write(Buffer.from([0x05, 0x02, 0x00, 0x02]));
    const reply = await r.read(2);
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
      const ar = await r.read(2);
      if (ar[0] !== 0x01 || ar[1] !== 0x00) {
        throw new Error('upstream: auth failed');
      }
    } else if (method === 0x00) {
      // upstream is happy without auth — proceed.
    } else if (method === 0xff) {
      throw new Error('upstream: no acceptable methods');
    } else {
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

    // Read VER REP RSV ATYP and then drain BND.ADDR + BND.PORT depending
    // on ATYP — using the buffered reader so any bytes that arrive in the
    // same TCP chunk are preserved for the subsequent reads.
    const head = await r.read(4);
    if (head[0] !== 0x05) throw new Error('upstream: not SOCKS5 reply');
    if (head[1] !== 0x00) throw new Error(`upstream: connect failed (rep=${head[1]})`);
    const replyAtyp = head[3];
    if (replyAtyp === 0x01) {
      await r.read(4 + 2);
    } else if (replyAtyp === 0x04) {
      await r.read(16 + 2);
    } else if (replyAtyp === 0x03) {
      const lenBuf = await r.read(1);
      await r.read((lenBuf[0] ?? 0) + 2);
    } else {
      throw new Error('upstream: unknown ATYP in reply');
    }
  } catch (err) {
    r.detach();
    sock.destroy();
    throw err;
  }

  // Detach the reader and hand the (possibly tail-buffered) socket back.
  const tail = r.detach();
  // Re-attach a no-op error handler so future async errors don't crash.
  sock.on('error', () => {
    /* surfaced via close handlers in the caller */
  });
  return { sock, tail };
}

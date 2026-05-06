import { useEffect, useState } from 'react';
import { CheckCircle2, Plus, Trash2, XCircle, Zap, Network } from 'lucide-react';
import type { ProxyCheckResult, ProxyConfig, ProxyType } from '@shared/types';
import { useApp } from '../store';
import { ImportProxiesModal } from '../components/ImportProxiesModal';

export function ProxiesPage(): JSX.Element {
  const proxies = useApp((s) => s.proxies);
  const refresh = useApp((s) => s.refresh);
  const [importOpen, setImportOpen] = useState(false);
  const [checking, setChecking] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Record<string, ProxyCheckResult>>({});

  // New proxy form
  const [type, setType] = useState<ProxyType>('http');
  const [host, setHost] = useState('');
  const [port, setPort] = useState<number>(8080);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [label, setLabel] = useState('');

  useEffect(() => {
    const unsub = window.api.events.onProxyCheckProgress((r) => {
      setProgress((prev) => ({ ...prev, [r.id]: r }));
    });
    return () => {
      unsub();
    };
  }, []);

  async function add(): Promise<void> {
    if (!host || !port) return;
    await window.api.proxies.create({
      type,
      host: host.trim(),
      port: Number(port),
      username: username.trim() || undefined,
      password: password || undefined,
      label: label.trim() || undefined,
    });
    setHost('');
    setUsername('');
    setPassword('');
    setLabel('');
    await refresh();
  }

  async function remove(id: string): Promise<void> {
    if (!confirm('Delete this proxy? Profiles using it will keep the assignment but fall back to direct.')) return;
    await window.api.proxies.delete(id);
    await refresh();
  }

  async function checkOne(id: string): Promise<void> {
    setChecking((s) => new Set([...s, id]));
    try {
      await window.api.proxies.check([id]);
      await refresh();
    } finally {
      setChecking((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }

  async function checkAll(): Promise<void> {
    const ids = proxies.map((p) => p.id);
    setChecking(new Set(ids));
    try {
      await window.api.proxies.check(ids);
      await refresh();
    } finally {
      setChecking(new Set());
    }
  }

  function statusFor(p: ProxyConfig): { ok: boolean | null; text: string } {
    const live = progress[p.id];
    if (live) {
      return { ok: live.ok, text: live.ok ? `${live.ip ?? '?'} · ${live.latencyMs}ms` : (live.error ?? 'fail') };
    }
    if (p.status === 'live') return { ok: true, text: `${p.lastIp ?? '?'}${p.lastCountry ? ` · ${p.lastCountry}` : ''}` };
    if (p.status === 'dead') return { ok: false, text: 'Dead' };
    return { ok: null, text: 'Unchecked' };
  }

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border flex items-center gap-3 bg-bg-surface">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Network size={18} className="text-accent" /> Proxies
        </h1>
        <div className="flex-1" />
        <button type="button" className="btn-secondary" onClick={() => setImportOpen(true)}>
          <Plus size={14} /> Bulk import
        </button>
        <button type="button" className="btn-primary" onClick={checkAll} disabled={proxies.length === 0}>
          <Zap size={14} /> Check all
        </button>
      </header>

      <div className="px-6 py-3 border-b border-border bg-bg-surface">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="w-32">
            <label className="label">Type</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value as ProxyType)}>
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
              <option value="socks4">SOCKS4</option>
              <option value="socks5">SOCKS5</option>
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="label">Host</label>
            <input className="input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="1.2.3.4" />
          </div>
          <div className="w-24">
            <label className="label">Port</label>
            <input
              className="input"
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value) || 0)}
            />
          </div>
          <div className="w-40">
            <label className="label">Username</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="w-40">
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="w-40">
            <label className="label">Label</label>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <button className="btn-primary" type="button" onClick={add} disabled={!host || !port}>
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {proxies.length === 0 ? (
          <div className="h-full flex items-center justify-center text-text-dim">
            <p>No proxies yet. Use the form above or the &ldquo;Bulk import&rdquo; button.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-bg-surface border-b border-border">
              <tr className="text-left text-xs uppercase text-text-dim">
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Host:Port</th>
                <th className="px-4 py-2">Auth</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Label</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {proxies.map((p) => {
                const st = statusFor(p);
                const isChecking = checking.has(p.id);
                return (
                  <tr key={p.id} className="border-b border-border hover:bg-bg-hover">
                    <td className="px-4 py-2">
                      <span className="font-mono text-xs uppercase text-text-muted">{p.type}</span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {p.host}:{p.port}
                    </td>
                    <td className="px-4 py-2 text-xs text-text-muted">
                      {p.username ? <span className="font-mono">{p.username}:••••</span> : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5 text-xs">
                        {isChecking ? (
                          <span className="text-warn">Checking…</span>
                        ) : st.ok === true ? (
                          <>
                            <CheckCircle2 size={14} className="text-success" />
                            <span className="text-text-muted">{st.text}</span>
                          </>
                        ) : st.ok === false ? (
                          <>
                            <XCircle size={14} className="text-danger" />
                            <span className="text-text-muted">{st.text}</span>
                          </>
                        ) : (
                          <span className="text-text-dim">{st.text}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-text-muted">{p.label ?? '—'}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="btn-ghost p-1.5"
                          onClick={() => checkOne(p.id)}
                          disabled={isChecking}
                          title="Check"
                        >
                          <Zap size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn-ghost p-1.5 text-danger hover:bg-danger/10"
                          onClick={() => remove(p.id)}
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <ImportProxiesModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import type { OsPlatform, ProxyConfig, ProxyType } from '@shared/types';
import { Modal } from './Modal';
import { useApp } from '../store';

interface Props {
  open: boolean;
  onClose(): void;
}

type ProxyMode = 'none' | 'existing' | 'paste';
type ExistingStatusFilter = 'all' | 'live' | 'unknown' | 'dead';

const STATUS_OPTIONS: Array<{ value: ExistingStatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live only' },
  { value: 'unknown', label: 'Unchecked' },
  { value: 'dead', label: 'Dead' },
];

const PASTE_TYPES: ProxyType[] = ['http', 'https', 'socks5', 'socks4'];

function proxyLabel(p: ProxyConfig): string {
  const base = p.label?.trim() ? p.label.trim() : `${p.type}://${p.host}:${p.port}`;
  return p.lastCountry ? `${base} (${p.lastCountry})` : base;
}

function countNonEmptyLines(text: string): number {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#')).length;
}

export function BulkCreateModal({ open, onClose }: Props): JSX.Element {
  const proxies = useApp((s) => s.proxies);
  const refresh = useApp((s) => s.refresh);

  const [count, setCount] = useState(10);
  const [namePrefix, setNamePrefix] = useState('Profile');
  const [group, setGroup] = useState('');
  const [startUrl, setStartUrl] = useState('');
  const [osMix, setOsMix] = useState<OsPlatform[]>(['windows']);

  const [proxyMode, setProxyMode] = useState<ProxyMode>('none');
  const [existingSearch, setExistingSearch] = useState('');
  const [existingStatus, setExistingStatus] = useState<ExistingStatusFilter>('all');
  const [selectedProxyIds, setSelectedProxyIds] = useState<Set<string>>(new Set());

  const [pasteText, setPasteText] = useState('');
  const [pasteType, setPasteType] = useState<ProxyType>('http');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens.
  useEffect(() => {
    if (open) {
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  // Filter existing proxies for the picker.
  const filteredProxies = useMemo(() => {
    const q = existingSearch.trim().toLowerCase();
    return proxies.filter((p) => {
      if (existingStatus !== 'all') {
        const s = p.status ?? 'unknown';
        if (s !== existingStatus) return false;
      }
      if (!q) return true;
      const hay = [p.label, p.host, p.type, p.lastCountry, p.lastIp]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [proxies, existingSearch, existingStatus]);

  function toggleOs(os: OsPlatform): void {
    setOsMix((prev) => (prev.includes(os) ? prev.filter((x) => x !== os) : [...prev, os]));
  }

  function toggleProxy(id: string): void {
    setSelectedProxyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFiltered(): void {
    setSelectedProxyIds((prev) => {
      const next = new Set(prev);
      for (const p of filteredProxies) next.add(p.id);
      return next;
    });
  }

  function clearAllFiltered(): void {
    setSelectedProxyIds((prev) => {
      const next = new Set(prev);
      for (const p of filteredProxies) next.delete(p.id);
      return next;
    });
  }

  // Auto-suggest count when user pastes proxies.
  function handlePasteChange(text: string): void {
    setPasteText(text);
    const n = countNonEmptyLines(text);
    if (n > 0 && proxyMode === 'paste') {
      setCount(Math.min(5000, Math.max(1, n)));
    }
  }

  const pasteCount = useMemo(() => countNonEmptyLines(pasteText), [pasteText]);
  const selectedCount = selectedProxyIds.size;

  // Preview: how many profiles get a proxy + first 3 assignments.
  const preview = useMemo(() => {
    if (proxyMode === 'none') {
      return { coveredCount: 0, lines: [] as string[], wraps: false };
    }
    let pool: Array<{ id?: string; preview: string }> = [];
    if (proxyMode === 'existing') {
      pool = proxies
        .filter((p) => selectedProxyIds.has(p.id))
        .map((p) => ({ id: p.id, preview: proxyLabel(p) }));
    } else {
      pool = pasteText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
        .slice(0, 5)
        .map((l) => ({ preview: `${pasteType}://${l}` }));
    }
    if (pool.length === 0) {
      return { coveredCount: 0, lines: [], wraps: false };
    }
    const lines: string[] = [];
    const max = Math.min(3, count);
    for (let i = 0; i < max; i++) {
      const slot = pool[i % pool.length]!;
      lines.push(`${namePrefix.trim() || 'Profile'} ${i + 1}  →  ${slot.preview}`);
    }
    return {
      coveredCount: count,
      lines,
      wraps: pool.length < count,
    };
  }, [proxyMode, proxies, selectedProxyIds, pasteText, pasteType, count, namePrefix]);

  function validate(): string | null {
    if (count < 1 || count > 5000) return 'Count must be between 1 and 5000.';
    if (osMix.length === 0) return 'Pick at least one OS for the fingerprint.';
    if (proxyMode === 'existing' && selectedProxyIds.size === 0) {
      return 'Select at least one proxy, or pick "No proxy".';
    }
    if (proxyMode === 'paste' && pasteCount === 0) {
      return 'Paste at least one proxy line, or pick "No proxy".';
    }
    return null;
  }

  async function submit(): Promise<void> {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      let proxyIds: string[] | undefined;

      if (proxyMode === 'existing') {
        proxyIds = Array.from(selectedProxyIds);
      } else if (proxyMode === 'paste') {
        const imported = await window.api.proxies.importBulk({
          text: pasteText,
          defaultType: pasteType,
        });
        if (imported.length === 0) {
          setError('No valid proxy lines found in the pasted text.');
          setSubmitting(false);
          return;
        }
        proxyIds = imported.map((p) => p.id);
      }

      await window.api.profiles.bulkCreate({
        count,
        namePrefix: namePrefix.trim() || 'Profile',
        group: group.trim() || undefined,
        startUrl: startUrl.trim() || undefined,
        proxyIds: proxyIds && proxyIds.length > 0 ? proxyIds : undefined,
        osMix: osMix.length > 0 ? osMix : undefined,
      });
      await refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bulk create profiles"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Creating…' : `Create ${count} profile${count === 1 ? '' : 's'}`}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-1">
          <label className="label">How many profiles?</label>
          <input
            type="number"
            min={1}
            max={5000}
            className="input"
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(5000, Number(e.target.value) || 1)))}
          />
        </div>
        <div className="col-span-1">
          <label className="label">Name prefix</label>
          <input
            type="text"
            className="input"
            value={namePrefix}
            onChange={(e) => setNamePrefix(e.target.value)}
            placeholder="Profile"
          />
        </div>
        <div className="col-span-1">
          <label className="label">Group (optional)</label>
          <input
            type="text"
            className="input"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder="e.g. fb-team-1"
          />
        </div>
        <div className="col-span-1">
          <label className="label">Start URL (optional)</label>
          <input
            type="text"
            className="input"
            value={startUrl}
            onChange={(e) => setStartUrl(e.target.value)}
            placeholder="https://www.google.com"
          />
        </div>

        <div className="col-span-2">
          <label className="label">Operating system mix (fingerprint)</label>
          <div className="flex gap-2">
            {(['windows', 'macos', 'linux'] as OsPlatform[]).map((os) => (
              <button
                key={os}
                type="button"
                onClick={() => toggleOs(os)}
                className={`btn ${
                  osMix.includes(os)
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : 'btn-secondary'
                }`}
              >
                {os}
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-2 mt-1">
          <div className="flex items-center justify-between mb-2">
            <label className="label !mb-0">Proxy assignment</label>
            <span className="text-xs text-text-dim">
              {proxies.length} saved · round-robin per profile
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            {(
              [
                { value: 'none', title: 'No proxy', sub: 'Profiles use direct connection' },
                {
                  value: 'existing',
                  title: 'From saved proxies',
                  sub:
                    proxies.length === 0
                      ? 'No proxies saved yet'
                      : `${proxies.length} available`,
                },
                {
                  value: 'paste',
                  title: 'Paste new proxies',
                  sub: 'Auto-import + assign 1:1',
                },
              ] as Array<{ value: ProxyMode; title: string; sub: string }>
            ).map((opt) => {
              const disabled = opt.value === 'existing' && proxies.length === 0;
              const active = proxyMode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => setProxyMode(opt.value)}
                  className={`text-left p-2.5 rounded-md border transition-colors ${
                    active
                      ? 'border-accent bg-accent/10'
                      : 'border-border bg-bg-surface hover:bg-bg-hover'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="text-sm font-medium text-text">{opt.title}</div>
                  <div className="text-xs text-text-dim mt-0.5">{opt.sub}</div>
                </button>
              );
            })}
          </div>

          {proxyMode === 'existing' && (
            <div className="card p-3 space-y-2">
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  type="text"
                  className="input flex-1 min-w-[160px]"
                  value={existingSearch}
                  onChange={(e) => setExistingSearch(e.target.value)}
                  placeholder="Search by host, label, country…"
                />
                <select
                  className="input w-auto"
                  value={existingStatus}
                  onChange={(e) =>
                    setExistingStatus(e.target.value as ExistingStatusFilter)
                  }
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn-ghost" onClick={selectAllFiltered}>
                  Select all
                </button>
                <button type="button" className="btn-ghost" onClick={clearAllFiltered}>
                  Clear
                </button>
              </div>

              <div className="text-xs text-text-dim flex items-center justify-between">
                <span>
                  {filteredProxies.length} match
                  {filteredProxies.length === 1 ? '' : 'es'} · {selectedCount} selected
                </span>
              </div>

              <div className="max-h-56 overflow-y-auto -mx-1 px-1 rounded">
                {filteredProxies.length === 0 ? (
                  <div className="text-center text-text-dim text-sm py-6">
                    No proxies match this filter.
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {filteredProxies.map((p) => {
                      const checked = selectedProxyIds.has(p.id);
                      return (
                        <li key={p.id}>
                          <label
                            className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm ${
                              checked ? 'bg-accent/10' : 'hover:bg-bg-hover'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="accent-accent"
                              checked={checked}
                              onChange={() => toggleProxy(p.id)}
                            />
                            <span className="font-mono text-xs text-text truncate flex-1">
                              {proxyLabel(p)}
                            </span>
                            <span
                              className={`text-xs ${
                                p.status === 'live'
                                  ? 'text-success'
                                  : p.status === 'dead'
                                    ? 'text-danger'
                                    : 'text-text-dim'
                              }`}
                            >
                              {p.status ?? 'unknown'}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}

          {proxyMode === 'paste' && (
            <div className="card p-3 space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-muted">Default scheme</label>
                <select
                  className="input w-auto"
                  value={pasteType}
                  onChange={(e) => setPasteType(e.target.value as ProxyType)}
                >
                  {PASTE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-text-dim ml-auto">
                  {pasteCount} valid line{pasteCount === 1 ? '' : 's'} detected
                </span>
              </div>
              <textarea
                className="input font-mono text-xs"
                rows={6}
                value={pasteText}
                onChange={(e) => handlePasteChange(e.target.value)}
                placeholder={
                  'Paste one proxy per line. Examples:\n' +
                  '1.2.3.4:8080\n' +
                  '1.2.3.4:8080:user:pass\n' +
                  'socks5://user:pass@1.2.3.4:1080'
                }
              />
              <div className="text-xs text-text-dim">
                Pasted proxies are imported into your proxy list and assigned to the new
                profiles. Lines starting with <span className="font-mono">#</span> are
                ignored.
              </div>
            </div>
          )}
        </div>

        {proxyMode !== 'none' && preview.lines.length > 0 && (
          <div className="col-span-2">
            <div className="card p-3 text-xs">
              <div className="text-text-muted mb-1.5 font-medium">Preview</div>
              <ul className="space-y-0.5 font-mono text-text-muted">
                {preview.lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
                {count > preview.lines.length && (
                  <li className="text-text-dim">
                    … and {count - preview.lines.length} more
                  </li>
                )}
              </ul>
              {preview.wraps && (
                <div className="text-warn text-xs mt-2">
                  Heads up: fewer proxies than profiles → assignments wrap (multiple
                  profiles share the same proxy).
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="col-span-2 text-danger text-sm bg-danger/10 border border-danger/30 rounded px-3 py-2">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

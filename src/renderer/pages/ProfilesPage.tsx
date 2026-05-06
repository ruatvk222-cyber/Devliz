import { useMemo, useState } from 'react';
import { Copy, Edit3, Play, Plus, Search, Square, Trash2, Users } from 'lucide-react';
import type { Profile } from '@shared/types';
import { useApp } from '../store';
import { StatusBadge } from '../components/StatusBadge';
import { BulkCreateModal } from '../components/BulkCreateModal';
import { EditProfileDrawer } from '../components/EditProfileDrawer';

export function ProfilesPage(): JSX.Element {
  const profiles = useApp((s) => s.profiles);
  const proxies = useApp((s) => s.proxies);
  const search = useApp((s) => s.search);
  const setSearch = useApp((s) => s.setSearch);
  const groupFilter = useApp((s) => s.groupFilter);
  const setGroupFilter = useApp((s) => s.setGroupFilter);
  const refresh = useApp((s) => s.refresh);
  const selected = useApp((s) => s.selectedProfileIds);
  const setSelected = useApp((s) => s.setSelected);
  const toggleSelected = useApp((s) => s.toggleSelected);
  const clearSelection = useApp((s) => s.clearSelection);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);

  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const p of profiles) if (p.group) set.add(p.group);
    return Array.from(set).sort();
  }, [profiles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles.filter((p) => {
      if (groupFilter && p.group !== groupFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.tags ?? '').toLowerCase().includes(q) ||
        (p.notes ?? '').toLowerCase().includes(q) ||
        (p.group ?? '').toLowerCase().includes(q)
      );
    });
  }, [profiles, search, groupFilter]);

  const proxyById = useMemo(() => {
    const m = new Map<string, (typeof proxies)[number]>();
    for (const p of proxies) m.set(p.id, p);
    return m;
  }, [proxies]);

  const allSelected = filtered.length > 0 && filtered.every((p) => selected.includes(p.id));

  function toggleAll(): void {
    if (allSelected) clearSelection();
    else setSelected(filtered.map((p) => p.id));
  }

  async function launch(id: string): Promise<void> {
    await window.api.launcher.launch(id);
  }
  async function stop(id: string): Promise<void> {
    await window.api.launcher.stop(id);
  }
  async function launchSelected(): Promise<void> {
    if (selected.length === 0) return;
    await window.api.launcher.launchMany(selected);
  }
  async function stopAll(): Promise<void> {
    await window.api.launcher.stopAll();
    await refresh();
  }
  async function duplicate(id: string): Promise<void> {
    await window.api.profiles.duplicate(id);
    await refresh();
  }
  async function remove(id: string): Promise<void> {
    if (!confirm('Delete this profile? This will not delete its on-disk data dir.')) return;
    await window.api.profiles.delete(id);
    await refresh();
  }
  async function removeSelected(): Promise<void> {
    if (selected.length === 0) return;
    if (!confirm(`Delete ${selected.length} profiles?`)) return;
    await window.api.profiles.deleteMany(selected);
    clearSelection();
    await refresh();
  }

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border flex items-center gap-3 bg-bg-surface">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Users size={18} className="text-accent" /> Profiles
        </h1>
        <div className="flex-1 max-w-md relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            type="text"
            placeholder="Search by name, tag, group…"
            className="input pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {groups.length > 0 && (
          <select
            className="input w-44"
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
          >
            <option value="">All groups</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-2">
          <button type="button" className="btn-primary" onClick={() => setBulkOpen(true)}>
            <Plus size={14} /> Bulk create
          </button>
          <button type="button" className="btn-success" onClick={launchSelected} disabled={selected.length === 0}>
            <Play size={14} /> Launch selected ({selected.length})
          </button>
          <button type="button" className="btn-secondary" onClick={stopAll}>
            <Square size={14} /> Stop all
          </button>
          <button type="button" className="btn-danger" onClick={removeSelected} disabled={selected.length === 0}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-text-dim">
            <div>
              <p className="mb-2">No profiles yet.</p>
              <button className="btn-primary" onClick={() => setBulkOpen(true)}>
                <Plus size={14} /> Bulk create your first profiles
              </button>
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-bg-surface border-b border-border z-10">
              <tr className="text-left text-xs uppercase text-text-dim">
                <th className="px-4 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="accent-accent"
                  />
                </th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Group</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">OS</th>
                <th className="px-4 py-2">Locale</th>
                <th className="px-4 py-2">Timezone</th>
                <th className="px-4 py-2">Proxy</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const proxy = p.proxyId ? proxyById.get(p.proxyId) : null;
                const isSelected = selected.includes(p.id);
                const isRunning = p.status === 'running' || p.status === 'launching';
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-border hover:bg-bg-hover transition-colors ${
                      isSelected ? 'bg-accent/5' : ''
                    }`}
                  >
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(p.id)}
                        className="accent-accent"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <button
                        className="text-text hover:text-accent text-left"
                        onClick={() => setEditing(p)}
                      >
                        {p.name}
                      </button>
                      {p.tags && (
                        <div className="text-xs text-text-dim mt-0.5">
                          {p.tags}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-text-muted">{p.group ?? '—'}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-2 text-text-muted text-xs">{p.fingerprint.os}</td>
                    <td className="px-4 py-2 text-text-muted text-xs">{p.fingerprint.locale}</td>
                    <td className="px-4 py-2 text-text-muted text-xs">{p.fingerprint.timezone}</td>
                    <td className="px-4 py-2 text-xs">
                      {proxy ? (
                        <div className="font-mono text-text-muted">
                          {proxy.type}://{proxy.host}:{proxy.port}
                          {proxy.lastCountry && (
                            <span className="ml-1 text-text-dim">[{proxy.lastCountry}]</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-text-dim">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {isRunning ? (
                          <button
                            type="button"
                            className="btn-secondary p-1.5"
                            title="Stop"
                            onClick={() => stop(p.id)}
                          >
                            <Square size={14} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-success p-1.5"
                            title="Launch"
                            onClick={() => launch(p.id)}
                          >
                            <Play size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-ghost p-1.5"
                          title="Edit"
                          onClick={() => setEditing(p)}
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn-ghost p-1.5"
                          title="Duplicate"
                          onClick={() => duplicate(p.id)}
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn-ghost p-1.5 text-danger hover:bg-danger/10"
                          title="Delete"
                          onClick={() => remove(p.id)}
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

      <BulkCreateModal open={bulkOpen} onClose={() => setBulkOpen(false)} />
      <EditProfileDrawer open={editing !== null} profile={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

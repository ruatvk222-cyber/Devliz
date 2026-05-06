import { useEffect, useState } from 'react';
import type { Profile } from '@shared/types';
import { Drawer } from './Drawer';
import { useApp } from '../store';

interface Props {
  open: boolean;
  onClose(): void;
  profile: Profile | null;
}

export function EditProfileDrawer({ open, onClose, profile }: Props): JSX.Element | null {
  const proxies = useApp((s) => s.proxies);
  const refresh = useApp((s) => s.refresh);

  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [startUrl, setStartUrl] = useState('');
  const [proxyId, setProxyId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setGroup(profile.group ?? '');
      setTags(profile.tags ?? '');
      setNotes(profile.notes ?? '');
      setStartUrl(profile.startUrl ?? '');
      setProxyId(profile.proxyId ?? '');
    }
  }, [profile]);

  if (!profile) return null;

  async function save(): Promise<void> {
    if (!profile) return;
    setSaving(true);
    try {
      await window.api.profiles.update(profile.id, {
        name: name.trim() || profile.name,
        group: group.trim() || undefined,
        tags: tags.trim() || undefined,
        notes: notes.trim() || undefined,
        startUrl: startUrl.trim() || undefined,
        proxyId: proxyId || undefined,
      });
      await refresh();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const fp = profile.fingerprint;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Edit · ${profile.name}`}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Group</label>
            <input className="input" value={group} onChange={(e) => setGroup(e.target.value)} />
          </div>
          <div>
            <label className="label">Tags (comma)</label>
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Start URL</label>
          <input className="input" value={startUrl} onChange={(e) => setStartUrl(e.target.value)} placeholder="https://www.google.com" />
        </div>
        <div>
          <label className="label">Proxy</label>
          <select
            className="input"
            value={proxyId}
            onChange={(e) => setProxyId(e.target.value)}
          >
            <option value="">— No proxy —</option>
            {proxies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label ?? `${p.type}://${p.host}:${p.port}`} {p.lastCountry ? `(${p.lastCountry})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea
            className="input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-2 text-text-muted">Fingerprint (read-only)</h3>
          <div className="card p-3 text-xs space-y-1.5 font-mono text-text-muted">
            <div className="flex justify-between gap-2">
              <span className="text-text-dim">OS</span>
              <span className="text-right">{fp.os}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-text-dim">Platform</span>
              <span className="text-right">{fp.platform}</span>
            </div>
            <div className="flex justify-between gap-2 break-all">
              <span className="text-text-dim shrink-0">User-Agent</span>
              <span className="text-right">{fp.userAgent}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-text-dim">Locale</span>
              <span className="text-right">{fp.locale}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-text-dim">Timezone</span>
              <span className="text-right">{fp.timezone}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-text-dim">Resolution</span>
              <span className="text-right">
                {fp.screenWidth}×{fp.screenHeight} @{fp.deviceScaleFactor}x
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-text-dim">Hardware</span>
              <span className="text-right">
                {fp.hardwareConcurrency} cores · {fp.deviceMemory} GB
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-text-dim">WebGL</span>
              <span className="text-right">{fp.webglRenderer}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-text-dim">Mask WebRTC</span>
              <span className="text-right">{fp.webrtcMask ? 'yes' : 'no'}</span>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-2 text-text-muted">Storage</h3>
          <div className="card p-3 text-xs font-mono text-text-muted break-all">
            {profile.dataDir}
          </div>
        </div>
      </div>
    </Drawer>
  );
}

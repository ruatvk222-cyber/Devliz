import { useState } from 'react';
import type { OsPlatform } from '@shared/types';
import { Modal } from './Modal';
import { useApp } from '../store';

interface Props {
  open: boolean;
  onClose(): void;
}

export function BulkCreateModal({ open, onClose }: Props): JSX.Element {
  const proxies = useApp((s) => s.proxies);
  const refresh = useApp((s) => s.refresh);

  const [count, setCount] = useState(10);
  const [namePrefix, setNamePrefix] = useState('Profile');
  const [group, setGroup] = useState('');
  const [startUrl, setStartUrl] = useState('');
  const [assignProxies, setAssignProxies] = useState(false);
  const [osMix, setOsMix] = useState<OsPlatform[]>(['windows']);
  const [submitting, setSubmitting] = useState(false);

  function toggleOs(os: OsPlatform): void {
    setOsMix((prev) => (prev.includes(os) ? prev.filter((x) => x !== os) : [...prev, os]));
  }

  async function submit(): Promise<void> {
    setSubmitting(true);
    try {
      const ids = assignProxies ? proxies.map((p) => p.id) : undefined;
      await window.api.profiles.bulkCreate({
        count,
        namePrefix: namePrefix.trim() || 'Profile',
        group: group.trim() || undefined,
        startUrl: startUrl.trim() || undefined,
        proxyIds: ids && ids.length > 0 ? ids : undefined,
        osMix: osMix.length > 0 ? osMix : undefined,
      });
      await refresh();
      onClose();
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
            {submitting ? 'Creating…' : `Create ${count} profiles`}
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
        <div className="col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-accent"
              checked={assignProxies}
              onChange={(e) => setAssignProxies(e.target.checked)}
              disabled={proxies.length === 0}
            />
            <span>
              Distribute existing proxies round-robin{' '}
              <span className="text-text-dim">({proxies.length} available)</span>
            </span>
          </label>
        </div>
      </div>
    </Modal>
  );
}

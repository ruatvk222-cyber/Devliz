import { useState } from 'react';
import type { ProxyType } from '@shared/types';
import { Modal } from './Modal';
import { useApp } from '../store';

interface Props {
  open: boolean;
  onClose(): void;
}

const EXAMPLE = `# One proxy per line. Examples:
# 1.2.3.4:8080
# 1.2.3.4:8080:user:pass
# socks5://user:pass@1.2.3.4:1080
# http://1.2.3.4:8080`;

export function ImportProxiesModal({ open, onClose }: Props): JSX.Element {
  const refresh = useApp((s) => s.refresh);
  const [text, setText] = useState('');
  const [defaultType, setDefaultType] = useState<ProxyType>('http');
  const [submitting, setSubmitting] = useState(false);
  const [resultCount, setResultCount] = useState<number | null>(null);

  async function submit(): Promise<void> {
    setSubmitting(true);
    setResultCount(null);
    try {
      const created = await window.api.proxies.importBulk({ text, defaultType });
      setResultCount(created.length);
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import proxies"
      width="max-w-2xl"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
            Close
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={submitting || !text.trim()}>
            {submitting ? 'Importing…' : 'Import'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">Default proxy type (used when scheme is missing)</label>
          <div className="flex gap-2">
            {(['http', 'https', 'socks4', 'socks5'] as ProxyType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDefaultType(t)}
                className={`btn ${
                  defaultType === t
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : 'btn-secondary'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Proxy list</label>
          <textarea
            className="input font-mono text-xs"
            rows={12}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={EXAMPLE}
          />
        </div>
        {resultCount !== null && (
          <div className="text-sm text-success">Imported {resultCount} proxies.</div>
        )}
      </div>
    </Modal>
  );
}

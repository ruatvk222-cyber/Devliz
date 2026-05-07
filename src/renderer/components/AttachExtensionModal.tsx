import { useEffect, useState } from 'react';
import { Folder, Globe, Package } from 'lucide-react';
import type { UserExtension } from '@shared/types';
import { Modal } from './Modal';
import { useApp } from '../store';
import { useT } from '../i18n';

interface Props {
  open: boolean;
  profileIds: string[];
  onClose(): void;
}

type Source = 'folder' | 'zip' | 'store';

export function AttachExtensionModal({ open, profileIds, onClose }: Props): JSX.Element {
  const refresh = useApp((s) => s.refresh);
  const t = useT();

  const [tab, setTab] = useState<Source>('folder');
  const [folderPath, setFolderPath] = useState('');
  const [zipPath, setZipPath] = useState('');
  const [storeUrl, setStoreUrl] = useState('');
  const [extName, setExtName] = useState('');

  const [installed, setInstalled] = useState<UserExtension[]>([]);
  const [selectedExisting, setSelectedExisting] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab('folder');
    setFolderPath('');
    setZipPath('');
    setStoreUrl('');
    setExtName('');
    setSelectedExisting('');
    setSubmitting(false);
    setError(null);
    setProgress(null);
    void window.api.extensions
      .list()
      .then((rows) => setInstalled(rows))
      .catch(() => setInstalled([]));
  }, [open]);

  async function pickFolder(): Promise<void> {
    const p = await window.api.extensions.pickFolder();
    if (p) setFolderPath(p);
  }
  async function pickZip(): Promise<void> {
    const p = await window.api.extensions.pickZip();
    if (p) setZipPath(p);
  }

  async function submit(): Promise<void> {
    if (profileIds.length === 0) {
      setError(t('extensions.errNoProfiles'));
      return;
    }
    setSubmitting(true);
    setError(null);
    setProgress(t('extensions.progressInstalling'));
    try {
      let extension: UserExtension | null = null;
      if (selectedExisting) {
        extension = installed.find((e) => e.id === selectedExisting) ?? null;
        if (!extension) throw new Error('Selected extension was not found.');
      } else if (tab === 'folder') {
        if (!folderPath.trim()) throw new Error(t('extensions.errPickFolder'));
        extension = await window.api.extensions.addFromFolder({
          folderPath: folderPath.trim(),
          name: extName.trim() || undefined,
        });
      } else if (tab === 'zip') {
        if (!zipPath.trim()) throw new Error(t('extensions.errPickZip'));
        extension = await window.api.extensions.addFromZip({
          zipPath: zipPath.trim(),
          name: extName.trim() || undefined,
        });
      } else {
        if (!storeUrl.trim()) throw new Error(t('extensions.errPickStore'));
        setProgress(t('extensions.progressDownloading'));
        extension = await window.api.extensions.addFromStore({
          urlOrId: storeUrl.trim(),
          name: extName.trim() || undefined,
        });
      }
      if (!extension) throw new Error('Failed to install extension.');
      setProgress(t('extensions.progressAttaching'));
      await window.api.extensions.attach(extension.id, profileIds);
      await refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  const tabBtn = (key: Source, icon: JSX.Element, label: string): JSX.Element => (
    <button
      key={key}
      type="button"
      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${
        tab === key
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-border bg-bg-surface hover:bg-bg-hover'
      }`}
      onClick={() => {
        setTab(key);
        setSelectedExisting('');
      }}
      disabled={submitting}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <Modal
      open={open}
      onClose={submitting ? () => undefined : onClose}
      title={t('extensions.modalTitle', { n: profileIds.length })}
      width="max-w-xl"
      footer={
        <>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={submit}
            disabled={submitting || profileIds.length === 0}
          >
            {submitting ? progress ?? t('common.saving') : t('extensions.install')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="text-sm text-text-muted">
          {t('extensions.modalDescription', { n: profileIds.length })}
        </div>

        {installed.length > 0 && (
          <div>
            <label className="label">{t('extensions.reuseLabel')}</label>
            <select
              className="input"
              value={selectedExisting}
              onChange={(e) => setSelectedExisting(e.target.value)}
              disabled={submitting}
            >
              <option value="">— {t('extensions.reuseAddNew')} —</option>
              {installed.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.source})
                </option>
              ))}
            </select>
          </div>
        )}

        {!selectedExisting && (
          <>
            <div className="flex gap-2">
              {tabBtn(
                'folder',
                <Folder size={14} />,
                t('extensions.tabFolder'),
              )}
              {tabBtn('zip', <Package size={14} />, t('extensions.tabZip'))}
              {tabBtn('store', <Globe size={14} />, t('extensions.tabStore'))}
            </div>

            {tab === 'folder' && (
              <div className="space-y-2">
                <label className="label">{t('extensions.folderLabel')}</label>
                <div className="flex gap-2">
                  <input
                    className="input flex-1 font-mono text-xs"
                    placeholder="C:\path\to\unpacked-extension"
                    value={folderPath}
                    onChange={(e) => setFolderPath(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={pickFolder}
                    disabled={submitting}
                  >
                    {t('extensions.browse')}
                  </button>
                </div>
                <p className="text-xs text-text-dim">
                  {t('extensions.folderHint')}
                </p>
              </div>
            )}

            {tab === 'zip' && (
              <div className="space-y-2">
                <label className="label">{t('extensions.zipLabel')}</label>
                <div className="flex gap-2">
                  <input
                    className="input flex-1 font-mono text-xs"
                    placeholder="C:\path\to\extension.zip"
                    value={zipPath}
                    onChange={(e) => setZipPath(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={pickZip}
                    disabled={submitting}
                  >
                    {t('extensions.browse')}
                  </button>
                </div>
                <p className="text-xs text-text-dim">
                  {t('extensions.zipHint')}
                </p>
              </div>
            )}

            {tab === 'store' && (
              <div className="space-y-2">
                <label className="label">{t('extensions.storeLabel')}</label>
                <input
                  className="input font-mono text-xs"
                  placeholder="https://chromewebstore.google.com/detail/.../<32-char-id>"
                  value={storeUrl}
                  onChange={(e) => setStoreUrl(e.target.value)}
                />
                <p className="text-xs text-text-dim">
                  {t('extensions.storeHint')}
                </p>
              </div>
            )}

            <div>
              <label className="label">{t('extensions.nameLabel')}</label>
              <input
                className="input"
                placeholder={t('extensions.namePlaceholder')}
                value={extName}
                onChange={(e) => setExtName(e.target.value)}
              />
            </div>
          </>
        )}

        {error && (
          <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

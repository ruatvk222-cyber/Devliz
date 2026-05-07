import { useEffect, useState } from 'react';
import {
  FileText,
  FolderOpen,
  Moon,
  RefreshCw,
  Save,
  Search,
  Settings as SettingsIcon,
  Sun,
} from 'lucide-react';
import type { AppLanguage, AppTheme, LaunchLogEntry } from '@shared/types';
import { useApp } from '../store';
import { useT } from '../i18n';

export function SettingsPage(): JSX.Element {
  const settings = useApp((s) => s.settings);
  const refresh = useApp((s) => s.refresh);
  const setSettings = useApp((s) => s.setSettings);
  const t = useT();

  const [chromePath, setChromePath] = useState(settings.chromePath ?? '');
  const [maxConcurrent, setMaxConcurrent] = useState(settings.maxConcurrentLaunches);
  const [defaultStartUrl, setDefaultStartUrl] = useState(settings.defaultStartUrl);
  const [profilesRoot, setProfilesRoot] = useState(settings.profilesRoot ?? '');
  const [language, setLanguage] = useState<AppLanguage>(settings.language);
  const [theme, setTheme] = useState<AppTheme>(settings.theme);
  const [forceEnUsLocale, setForceEnUsLocale] = useState(settings.forceEnUsLocale);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Launch logs (diagnostics)
  const [logs, setLogs] = useState<LaunchLogEntry[]>([]);
  const [logBody, setLogBody] = useState<string | null>(null);
  const [logName, setLogName] = useState<string | null>(null);

  async function refreshLogs(): Promise<void> {
    try {
      const list = await window.api.logs.list();
      setLogs(list);
    } catch {
      setLogs([]);
    }
  }

  async function viewLog(name: string): Promise<void> {
    setLogName(name);
    setLogBody('Loading…');
    try {
      const body = await window.api.logs.read(name);
      setLogBody(body ?? '(empty)');
    } catch (err) {
      setLogBody(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    setChromePath(settings.chromePath ?? '');
    setMaxConcurrent(settings.maxConcurrentLaunches);
    setDefaultStartUrl(settings.defaultStartUrl);
    setProfilesRoot(settings.profilesRoot ?? '');
    setLanguage(settings.language);
    setTheme(settings.theme);
    setForceEnUsLocale(settings.forceEnUsLocale);
  }, [settings]);

  useEffect(() => {
    void refreshLogs();
  }, []);

  // Live-preview theme + language without a full save round-trip.
  function applyTheme(next: AppTheme): void {
    setTheme(next);
    setSettings({ ...settings, theme: next });
  }
  function applyLanguage(next: AppLanguage): void {
    setLanguage(next);
    setSettings({ ...settings, language: next });
  }

  async function detect(): Promise<void> {
    const found = await window.api.settings.detectChromePath();
    if (found) setChromePath(found);
  }

  async function save(): Promise<void> {
    setSaving(true);
    try {
      await window.api.settings.update({
        chromePath: chromePath.trim() || undefined,
        maxConcurrentLaunches: Math.max(1, Math.min(50, Math.floor(maxConcurrent))),
        defaultStartUrl: defaultStartUrl.trim(),
        profilesRoot: profilesRoot.trim() || undefined,
        language,
        theme,
        forceEnUsLocale,
      });
      await refresh();
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border flex items-center gap-3 bg-bg-surface">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <SettingsIcon size={18} className="text-accent" /> {t('settings.title')}
        </h1>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-6">
          {/* ---- Appearance ---- */}
          <div className="card p-4">
            <h2 className="font-semibold mb-3">{t('settings.appearanceHeader')}</h2>
            <div className="space-y-3">
              <div>
                <label className="label">{t('settings.theme')}</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={theme === 'dark' ? 'btn-primary' : 'btn-secondary'}
                    onClick={() => applyTheme('dark')}
                  >
                    <Moon size={14} /> {t('settings.theme.dark')}
                  </button>
                  <button
                    type="button"
                    className={theme === 'light' ? 'btn-primary' : 'btn-secondary'}
                    onClick={() => applyTheme('light')}
                  >
                    <Sun size={14} /> {t('settings.theme.light')}
                  </button>
                </div>
              </div>
              <div>
                <label className="label">{t('settings.language')}</label>
                <select
                  className="input"
                  value={language}
                  onChange={(e) => applyLanguage(e.target.value as AppLanguage)}
                >
                  <option value="en-US">English (en-US)</option>
                  <option value="vi-VN">Tiếng Việt (vi-VN)</option>
                </select>
              </div>
            </div>
          </div>

          {/* ---- Fingerprint ---- */}
          <div className="card p-4">
            <h2 className="font-semibold mb-3">{t('settings.fingerprintHeader')}</h2>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={forceEnUsLocale}
                onChange={(e) => setForceEnUsLocale(e.target.checked)}
                className="accent-accent mt-1"
              />
              <span>
                {t('settings.forceEnUsLocale')}
                <span className="block text-xs text-text-dim mt-0.5">
                  {t('settings.forceEnUsLocaleHelp')}
                </span>
              </span>
            </label>
          </div>

          {/* ---- Browser ---- */}
          <div className="card p-4">
            <h2 className="font-semibold mb-3">{t('settings.browserHeader')}</h2>
            <div className="space-y-3">
              <div>
                <label className="label">{t('settings.chromePath')}</label>
                <div className="flex gap-2">
                  <input
                    className="input flex-1 font-mono text-xs"
                    value={chromePath}
                    onChange={(e) => setChromePath(e.target.value)}
                    placeholder="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
                  />
                  <button type="button" className="btn-secondary" onClick={detect}>
                    <Search size={14} /> {t('settings.autoDetect')}
                  </button>
                </div>
                <p className="text-xs text-text-dim mt-1">
                  {t('settings.chromePathHelp')}
                </p>
              </div>
              <div>
                <label className="label">{t('settings.defaultStartUrl')}</label>
                <input
                  className="input"
                  value={defaultStartUrl}
                  onChange={(e) => setDefaultStartUrl(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* ---- Performance ---- */}
          <div className="card p-4">
            <h2 className="font-semibold mb-3">{t('settings.performanceHeader')}</h2>
            <div className="space-y-3">
              <div>
                <label className="label">{t('settings.maxConcurrent')}</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={50}
                  value={maxConcurrent}
                  onChange={(e) => setMaxConcurrent(Number(e.target.value) || 1)}
                />
                <p className="text-xs text-text-dim mt-1">
                  {t('settings.maxConcurrentHelp')}
                </p>
              </div>
              <div>
                <label className="label">{t('settings.profilesRoot')}</label>
                <input
                  className="input font-mono text-xs"
                  value={profilesRoot}
                  onChange={(e) => setProfilesRoot(e.target.value)}
                  placeholder="(default: app userData/profiles)"
                />
              </div>
            </div>
          </div>

          {/* ---- Diagnostics ---- */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">{t('settings.diagnosticsHeader')}</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={refreshLogs}
                  title={t('settings.diagnosticsRefresh')}
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void window.api.logs.openFolder()}
                >
                  <FolderOpen size={14} /> {t('settings.diagnosticsOpenFolder')}
                </button>
              </div>
            </div>
            <p className="text-xs text-text-dim mb-3">
              {t('settings.diagnosticsHelp')}
            </p>
            {logs.length === 0 ? (
              <p className="text-sm text-text-muted">{t('settings.diagnosticsEmpty')}</p>
            ) : (
              <div className="border border-border rounded-md max-h-48 overflow-auto">
                {logs.map((l) => (
                  <button
                    type="button"
                    key={l.path}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-mono border-b border-border last:border-b-0 hover:bg-bg-hover ${
                      logName === l.name ? 'bg-bg-hover' : ''
                    }`}
                    onClick={() => void viewLog(l.name)}
                  >
                    <FileText size={12} className="text-text-muted shrink-0" />
                    <span className="flex-1 truncate">{l.name}</span>
                    <span className="text-text-dim shrink-0">
                      {(l.size / 1024).toFixed(1)} KB · {new Date(l.mtime).toLocaleString()}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {logBody !== null && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="label mb-0">{logName}</label>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    onClick={() => {
                      if (logBody) void navigator.clipboard.writeText(logBody);
                    }}
                  >
                    {t('settings.diagnosticsCopy')}
                  </button>
                </div>
                <pre className="bg-bg-deep border border-border rounded-md p-3 text-xs font-mono overflow-auto max-h-72 whitespace-pre-wrap break-all">
                  {logBody}
                </pre>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button className="btn-primary" onClick={save} disabled={saving}>
              <Save size={14} /> {saving ? t('settings.saving') : t('settings.save')}
            </button>
            {savedAt !== null && (
              <span className="text-xs text-success">
                {t('settings.savedAt')} {new Date(savedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

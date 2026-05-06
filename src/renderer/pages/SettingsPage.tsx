import { useEffect, useState } from 'react';
import { Save, Settings as SettingsIcon, Search } from 'lucide-react';
import { useApp } from '../store';

export function SettingsPage(): JSX.Element {
  const settings = useApp((s) => s.settings);
  const refresh = useApp((s) => s.refresh);

  const [chromePath, setChromePath] = useState(settings.chromePath ?? '');
  const [maxConcurrent, setMaxConcurrent] = useState(settings.maxConcurrentLaunches);
  const [defaultStartUrl, setDefaultStartUrl] = useState(settings.defaultStartUrl);
  const [profilesRoot, setProfilesRoot] = useState(settings.profilesRoot ?? '');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setChromePath(settings.chromePath ?? '');
    setMaxConcurrent(settings.maxConcurrentLaunches);
    setDefaultStartUrl(settings.defaultStartUrl);
    setProfilesRoot(settings.profilesRoot ?? '');
  }, [settings]);

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
          <SettingsIcon size={18} className="text-accent" /> Settings
        </h1>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-6">
          <div className="card p-4">
            <h2 className="font-semibold mb-3">Browser</h2>
            <div className="space-y-3">
              <div>
                <label className="label">Chrome / Edge / Chromium binary path</label>
                <div className="flex gap-2">
                  <input
                    className="input flex-1 font-mono text-xs"
                    value={chromePath}
                    onChange={(e) => setChromePath(e.target.value)}
                    placeholder="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
                  />
                  <button type="button" className="btn-secondary" onClick={detect}>
                    <Search size={14} /> Auto-detect
                  </button>
                </div>
                <p className="text-xs text-text-dim mt-1">
                  Leave empty to auto-detect on launch.
                </p>
              </div>
              <div>
                <label className="label">Default start URL</label>
                <input
                  className="input"
                  value={defaultStartUrl}
                  onChange={(e) => setDefaultStartUrl(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="card p-4">
            <h2 className="font-semibold mb-3">Performance</h2>
            <div className="space-y-3">
              <div>
                <label className="label">Max concurrent launches (1–50)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={50}
                  value={maxConcurrent}
                  onChange={(e) => setMaxConcurrent(Number(e.target.value) || 1)}
                />
                <p className="text-xs text-text-dim mt-1">
                  When you launch a batch of profiles, this many start in parallel.
                </p>
              </div>
              <div>
                <label className="label">Profiles root directory (optional override)</label>
                <input
                  className="input font-mono text-xs"
                  value={profilesRoot}
                  onChange={(e) => setProfilesRoot(e.target.value)}
                  placeholder="(default: app userData/profiles)"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="btn-primary" onClick={save} disabled={saving}>
              <Save size={14} /> {saving ? 'Saving…' : 'Save settings'}
            </button>
            {savedAt !== null && (
              <span className="text-xs text-success">
                Saved at {new Date(savedAt).toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="card p-4 bg-warn/5 border-warn/30">
            <h2 className="font-semibold mb-1 text-warn">Disclaimer</h2>
            <p className="text-xs text-text-muted">
              Devliz spoofs browser fingerprints at the JavaScript and Chrome flag layer. It does not
              patch the Chromium binary itself, so advanced fingerprinters (creepjs pro,
              fingerprintjs commercial, etc.) may still detect inconsistencies. You are responsible
              for complying with the Terms of Service of any website you access. Use at your own
              risk.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Mail, Play, Search, Zap } from 'lucide-react';
import type { AutomationConfig, Profile } from '@shared/types';
import { DEFAULT_AUTOMATION_GMAIL } from '@shared/types';
import { useApp } from '../store';
import { useT } from '../i18n';

interface AutomationCardData {
  kind: AutomationConfig['kind'];
  icon: JSX.Element;
  nameKey: string;
  descKey: string;
  default: AutomationConfig;
}

const AUTOMATIONS: AutomationCardData[] = [
  {
    kind: 'gmail-auto-reader',
    icon: <Mail size={20} />,
    nameKey: 'automation.gar.name',
    descKey: 'automation.gar.desc',
    default: DEFAULT_AUTOMATION_GMAIL,
  },
];

export function AutomationPage(): JSX.Element {
  const t = useT();
  const profiles = useApp((s) => s.profiles);
  const [opened, setOpened] = useState<AutomationCardData | null>(null);

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border flex items-center gap-3 bg-bg-surface">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Zap size={18} className="text-accent" /> {t('automation.title')}
        </h1>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto p-6 space-y-4">
          <p className="text-sm text-text-muted">{t('automation.subtitle')}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {AUTOMATIONS.map((a) => (
              <div key={a.kind} className="card p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-md bg-accent/15 text-accent flex items-center justify-center shrink-0">
                    {a.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{t(a.nameKey)}</div>
                    <p className="text-xs text-text-muted mt-1">{t(a.descKey)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-primary self-start"
                  onClick={() => setOpened(a)}
                >
                  <Play size={14} /> {t('automation.openButton')}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {opened && (
        <RunAutomationModal
          automation={opened}
          profiles={profiles}
          onClose={() => setOpened(null)}
        />
      )}
    </div>
  );
}

interface RunAutomationModalProps {
  automation: AutomationCardData;
  profiles: Profile[];
  onClose: () => void;
}

function RunAutomationModal({
  automation,
  profiles,
  onClose,
}: RunAutomationModalProps): JSX.Element {
  const t = useT();
  const [readSeconds, setReadSeconds] = useState(automation.default.readSeconds);
  const [maxItems, setMaxItems] = useState(automation.default.maxItems);
  const [humanLike, setHumanLike] = useState(automation.default.humanLike);
  const [closeOnFinish, setCloseOnFinish] = useState(automation.default.closeOnFinish);
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [running, setRunning] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.group ?? '').toLowerCase().includes(q) ||
        (p.tags ?? '').toLowerCase().includes(q),
    );
  }, [profiles, search]);

  function togglePick(id: string): void {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function run(): Promise<void> {
    if (picked.length === 0) return;
    setRunning(true);
    try {
      const config: AutomationConfig = {
        kind: automation.kind,
        readSeconds: clamp(readSeconds, 1, 120),
        maxItems: clamp(maxItems, 1, 200),
        humanLike,
        closeOnFinish,
      };
      if (picked.length === 1) {
        await window.api.launcher.launchWithAutomation(picked[0]!, config);
      } else {
        await window.api.launcher.launchManyWithAutomation(picked, config);
      }
      onClose();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      role="dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-bg-surface border border-border rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="font-semibold">{t(automation.nameKey)}</div>
          <button type="button" className="btn-ghost px-2" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t('automation.readSeconds')}</label>
              <input
                type="number"
                min={1}
                max={120}
                className="input"
                value={readSeconds}
                onChange={(e) => setReadSeconds(Number(e.target.value) || 1)}
              />
            </div>
            <div>
              <label className="label">{t('automation.maxItems')}</label>
              <input
                type="number"
                min={1}
                max={200}
                className="input"
                value={maxItems}
                onChange={(e) => setMaxItems(Number(e.target.value) || 1)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={humanLike}
              onChange={(e) => setHumanLike(e.target.checked)}
              className="accent-accent"
            />
            {t('automation.humanLike')}
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={closeOnFinish}
              onChange={(e) => setCloseOnFinish(e.target.checked)}
              className="accent-accent"
            />
            {t('automation.closeOnFinish')}
          </label>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="label !mb-0">{t('automation.profilesPicker')}</label>
              <span className="text-xs text-text-dim">({picked.length})</span>
              <div className="flex-1" />
              <button
                type="button"
                className="btn-ghost px-2 py-1 text-xs"
                onClick={() => setPicked(filtered.map((p) => p.id))}
              >
                {t('automation.selectAll')}
              </button>
              <button
                type="button"
                className="btn-ghost px-2 py-1 text-xs"
                onClick={() => setPicked([])}
              >
                {t('automation.clear')}
              </button>
            </div>
            <div className="relative mb-2">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim"
              />
              <input
                type="text"
                placeholder={t('profiles.search')}
                className="input pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {profiles.length === 0 ? (
              <p className="text-sm text-text-dim p-3 border border-dashed border-border rounded-md">
                {t('automation.noProfiles')}
              </p>
            ) : (
              <div className="max-h-64 overflow-auto border border-border rounded-md divide-y divide-border">
                {filtered.map((p) => {
                  const isPicked = picked.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm hover:bg-bg-hover ${
                        isPicked ? 'bg-accent/5' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isPicked}
                        onChange={() => togglePick(p.id)}
                        className="accent-accent"
                      />
                      <span className="flex-1">{p.name}</span>
                      {p.group && (
                        <span className="text-xs text-text-dim">{p.group}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            ✕
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={run}
            disabled={picked.length === 0 || running}
          >
            <Play size={14} />{' '}
            {running ? '…' : `${t('automation.run')} (${picked.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

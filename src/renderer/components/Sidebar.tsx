import { Globe2, Network, Settings as SettingsIcon, Shield } from 'lucide-react';
import { useApp } from '../store';

interface SidebarProps {
  current: 'profiles' | 'proxies' | 'settings';
  onNavigate(p: 'profiles' | 'proxies' | 'settings'): void;
}

const items: Array<{ key: SidebarProps['current']; label: string; icon: JSX.Element }> = [
  { key: 'profiles', label: 'Profiles', icon: <Globe2 size={18} /> },
  { key: 'proxies', label: 'Proxies', icon: <Network size={18} /> },
  { key: 'settings', label: 'Settings', icon: <SettingsIcon size={18} /> },
];

export function Sidebar({ current, onNavigate }: SidebarProps): JSX.Element {
  const profilesCount = useApp((s) => s.profiles.length);
  const runningCount = useApp((s) => s.profiles.filter((p) => p.status === 'running').length);
  const proxyCount = useApp((s) => s.proxies.length);

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-bg-surface flex flex-col">
      <div className="px-4 py-4 flex items-center gap-2 border-b border-border">
        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-accent to-purple-500 flex items-center justify-center">
          <Shield size={18} className="text-white" />
        </div>
        <div>
          <div className="font-semibold leading-tight">Devliz</div>
          <div className="text-[10px] text-text-dim">Antidetect Manager</div>
        </div>
      </div>

      <nav className="p-2 flex-1">
        {items.map((it) => {
          const active = current === it.key;
          let count: number | undefined;
          if (it.key === 'profiles') count = profilesCount;
          else if (it.key === 'proxies') count = proxyCount;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onNavigate(it.key)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md mb-1 transition-colors ${
                active
                  ? 'bg-accent/15 text-accent border border-accent/20'
                  : 'text-text-muted hover:bg-bg-hover hover:text-text border border-transparent'
              }`}
            >
              {it.icon}
              <span className="flex-1 text-left">{it.label}</span>
              {count !== undefined && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-dim">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border text-xs text-text-dim">
        <div className="flex items-center justify-between">
          <span>Running</span>
          <span className="text-success font-medium">{runningCount}</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span>Total</span>
          <span>{profilesCount}</span>
        </div>
      </div>
    </aside>
  );
}

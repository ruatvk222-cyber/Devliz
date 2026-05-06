import { create } from 'zustand';
import type { AppSettings, LauncherStatus, Profile, ProxyConfig } from '@shared/types';
import { DEFAULT_APP_SETTINGS } from '@shared/types';

interface AppState {
  profiles: Profile[];
  proxies: ProxyConfig[];
  settings: AppSettings;
  selectedProfileIds: string[];
  search: string;
  groupFilter: string;
  loading: boolean;

  setProfiles(profiles: Profile[]): void;
  setProxies(proxies: ProxyConfig[]): void;
  setSettings(settings: AppSettings): void;
  setSearch(s: string): void;
  setGroupFilter(g: string): void;
  setSelected(ids: string[]): void;
  toggleSelected(id: string): void;
  clearSelection(): void;
  applyLauncherStatus(s: LauncherStatus): void;
  setLoading(b: boolean): void;
  refresh(): Promise<void>;
}

export const useApp = create<AppState>((set, get) => ({
  profiles: [],
  proxies: [],
  settings: DEFAULT_APP_SETTINGS,
  selectedProfileIds: [],
  search: '',
  groupFilter: '',
  loading: false,

  setProfiles: (profiles) => set({ profiles }),
  setProxies: (proxies) => set({ proxies }),
  setSettings: (settings) => set({ settings }),
  setSearch: (search) => set({ search }),
  setGroupFilter: (groupFilter) => set({ groupFilter }),
  setSelected: (selectedProfileIds) => set({ selectedProfileIds }),
  toggleSelected: (id) =>
    set((s) => ({
      selectedProfileIds: s.selectedProfileIds.includes(id)
        ? s.selectedProfileIds.filter((x) => x !== id)
        : [...s.selectedProfileIds, id],
    })),
  clearSelection: () => set({ selectedProfileIds: [] }),
  applyLauncherStatus: (status) =>
    set((s) => ({
      profiles: s.profiles.map((p) =>
        p.id === status.profileId ? { ...p, status: status.status } : p,
      ),
    })),
  setLoading: (loading) => set({ loading }),

  async refresh() {
    set({ loading: true });
    try {
      const [profiles, proxies, settings] = await Promise.all([
        window.api.profiles.list(),
        window.api.proxies.list(),
        window.api.settings.get(),
      ]);
      set({ profiles, proxies, settings });
    } finally {
      set({ loading: false });
    }
    // Sync running statuses
    const running = await window.api.launcher.status();
    const runningIds = new Set(running.map((r) => r.profileId));
    set((s) => ({
      profiles: s.profiles.map((p) =>
        runningIds.has(p.id) ? { ...p, status: 'running' as const } : p,
      ),
    }));
    void get;
  },
}));

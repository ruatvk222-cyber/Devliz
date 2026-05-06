import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { ProfilesPage } from './pages/ProfilesPage';
import { ProxiesPage } from './pages/ProxiesPage';
import { SettingsPage } from './pages/SettingsPage';
import { AutomationPage } from './pages/AutomationPage';
import { useApp } from './store';

type Page = 'profiles' | 'proxies' | 'automation' | 'settings';

export default function App(): JSX.Element {
  const [page, setPage] = useState<Page>('profiles');
  const refresh = useApp((s) => s.refresh);
  const applyLauncherStatus = useApp((s) => s.applyLauncherStatus);
  const theme = useApp((s) => s.settings.theme);

  useEffect(() => {
    void refresh();
    const unsub = window.api.events.onLauncherStatus((status) => {
      applyLauncherStatus(status);
    });
    return () => {
      unsub();
    };
  }, [refresh, applyLauncherStatus]);

  // Apply current theme to <html data-theme="…"> so the CSS variable
  // palette switches without needing per-component changes.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="flex h-screen w-screen bg-bg text-text">
      <Sidebar current={page} onNavigate={setPage} />
      <main className="flex-1 overflow-hidden">
        {page === 'profiles' && <ProfilesPage />}
        {page === 'proxies' && <ProxiesPage />}
        {page === 'automation' && <AutomationPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

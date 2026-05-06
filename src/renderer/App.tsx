import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { ProfilesPage } from './pages/ProfilesPage';
import { ProxiesPage } from './pages/ProxiesPage';
import { SettingsPage } from './pages/SettingsPage';
import { useApp } from './store';

type Page = 'profiles' | 'proxies' | 'settings';

export default function App(): JSX.Element {
  const [page, setPage] = useState<Page>('profiles');
  const refresh = useApp((s) => s.refresh);
  const applyLauncherStatus = useApp((s) => s.applyLauncherStatus);

  useEffect(() => {
    void refresh();
    const unsub = window.api.events.onLauncherStatus((status) => {
      applyLauncherStatus(status);
    });
    return () => {
      unsub();
    };
  }, [refresh, applyLauncherStatus]);

  return (
    <div className="flex h-screen w-screen bg-bg text-text">
      <Sidebar current={page} onNavigate={setPage} />
      <main className="flex-1 overflow-hidden">
        {page === 'profiles' && <ProfilesPage />}
        {page === 'proxies' && <ProxiesPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

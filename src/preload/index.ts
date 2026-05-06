import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppSettings,
  AutomationConfig,
  BulkCreateOptions,
  IpcApi,
  LauncherStatus,
  Profile,
  ProxyCheckResult,
  ProxyConfig,
  ProxyImportOptions,
} from '@shared/types';

const api: IpcApi = {
  profiles: {
    list: () => ipcRenderer.invoke('profiles.list') as Promise<Profile[]>,
    get: (id) => ipcRenderer.invoke('profiles.get', id) as Promise<Profile | null>,
    create: (input) => ipcRenderer.invoke('profiles.create', input) as Promise<Profile>,
    bulkCreate: (options: BulkCreateOptions) =>
      ipcRenderer.invoke('profiles.bulkCreate', options) as Promise<Profile[]>,
    update: (id, patch) => ipcRenderer.invoke('profiles.update', id, patch) as Promise<Profile>,
    delete: (id) => ipcRenderer.invoke('profiles.delete', id) as Promise<void>,
    deleteMany: (ids) => ipcRenderer.invoke('profiles.deleteMany', ids) as Promise<void>,
    duplicate: (id) => ipcRenderer.invoke('profiles.duplicate', id) as Promise<Profile>,
  },
  proxies: {
    list: () => ipcRenderer.invoke('proxies.list') as Promise<ProxyConfig[]>,
    create: (input) => ipcRenderer.invoke('proxies.create', input) as Promise<ProxyConfig>,
    update: (id, patch) => ipcRenderer.invoke('proxies.update', id, patch) as Promise<ProxyConfig>,
    delete: (id) => ipcRenderer.invoke('proxies.delete', id) as Promise<void>,
    importBulk: (options: ProxyImportOptions) =>
      ipcRenderer.invoke('proxies.importBulk', options) as Promise<ProxyConfig[]>,
    check: (ids) => ipcRenderer.invoke('proxies.check', ids) as Promise<ProxyCheckResult[]>,
  },
  launcher: {
    launch: (id) => ipcRenderer.invoke('launcher.launch', id) as Promise<LauncherStatus>,
    launchMany: (ids) => ipcRenderer.invoke('launcher.launchMany', ids) as Promise<LauncherStatus[]>,
    launchWithAutomation: (id, automation: AutomationConfig) =>
      ipcRenderer.invoke('launcher.launchWithAutomation', id, automation) as Promise<LauncherStatus>,
    launchManyWithAutomation: (ids, automation: AutomationConfig) =>
      ipcRenderer.invoke('launcher.launchManyWithAutomation', ids, automation) as Promise<LauncherStatus[]>,
    stop: (id) => ipcRenderer.invoke('launcher.stop', id) as Promise<void>,
    stopAll: () => ipcRenderer.invoke('launcher.stopAll') as Promise<void>,
    status: () => ipcRenderer.invoke('launcher.status') as Promise<LauncherStatus[]>,
  },
  settings: {
    get: () => ipcRenderer.invoke('settings.get') as Promise<AppSettings>,
    update: (patch) => ipcRenderer.invoke('settings.update', patch) as Promise<AppSettings>,
    detectChromePath: () => ipcRenderer.invoke('settings.detectChromePath') as Promise<string | null>,
  },
  events: {
    onLauncherStatus: (cb) => {
      const listener = (_e: unknown, status: LauncherStatus) => cb(status);
      ipcRenderer.on('launcher.status', listener);
      return () => ipcRenderer.off('launcher.status', listener);
    },
    onProxyCheckProgress: (cb) => {
      const listener = (_e: unknown, result: ProxyCheckResult) => cb(result);
      ipcRenderer.on('proxy.check.progress', listener);
      return () => ipcRenderer.off('proxy.check.progress', listener);
    },
  },
};

try {
  contextBridge.exposeInMainWorld('api', api);
} catch (err) {
  console.error('Failed to expose API to renderer:', err);
}

import { contextBridge, ipcRenderer } from 'electron';
import type {
  AddExtensionFolderInput,
  AddExtensionStoreInput,
  AddExtensionZipInput,
  AppSettings,
  AutomationConfig,
  BulkCreateOptions,
  IpcApi,
  LaunchLogEntry,
  LauncherStatus,
  Profile,
  ProxyCheckResult,
  ProxyConfig,
  ProxyImportOptions,
  UpdateStatus,
  UserExtension,
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
    deleteMany: (ids) => ipcRenderer.invoke('proxies.deleteMany', ids) as Promise<void>,
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
  extensions: {
    list: () => ipcRenderer.invoke('extensions.list') as Promise<UserExtension[]>,
    addFromFolder: (input: AddExtensionFolderInput) =>
      ipcRenderer.invoke('extensions.addFromFolder', input) as Promise<UserExtension>,
    addFromZip: (input: AddExtensionZipInput) =>
      ipcRenderer.invoke('extensions.addFromZip', input) as Promise<UserExtension>,
    addFromStore: (input: AddExtensionStoreInput) =>
      ipcRenderer.invoke('extensions.addFromStore', input) as Promise<UserExtension>,
    delete: (id) => ipcRenderer.invoke('extensions.delete', id) as Promise<void>,
    forProfile: (profileId) =>
      ipcRenderer.invoke('extensions.forProfile', profileId) as Promise<UserExtension[]>,
    attach: (extensionId, profileIds) =>
      ipcRenderer.invoke('extensions.attach', extensionId, profileIds) as Promise<void>,
    detach: (extensionId, profileIds) =>
      ipcRenderer.invoke('extensions.detach', extensionId, profileIds) as Promise<void>,
    pickFolder: () => ipcRenderer.invoke('extensions.pickFolder') as Promise<string | null>,
    pickZip: () => ipcRenderer.invoke('extensions.pickZip') as Promise<string | null>,
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
  logs: {
    list: () => ipcRenderer.invoke('logs.list') as Promise<LaunchLogEntry[]>,
    read: (name: string) => ipcRenderer.invoke('logs.read', name) as Promise<string | null>,
    openFolder: () => ipcRenderer.invoke('logs.openFolder') as Promise<void>,
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app.getVersion') as Promise<string>,
  },
  updater: {
    check: () => ipcRenderer.invoke('updater.check') as Promise<UpdateStatus>,
    download: () => ipcRenderer.invoke('updater.download') as Promise<UpdateStatus>,
    quitAndInstall: () => ipcRenderer.invoke('updater.quitAndInstall') as Promise<void>,
    getStatus: () => ipcRenderer.invoke('updater.status') as Promise<UpdateStatus>,
    onStatus: (cb) => {
      const listener = (_e: unknown, status: UpdateStatus) => cb(status);
      ipcRenderer.on('updater.status', listener);
      return () => ipcRenderer.off('updater.status', listener);
    },
  },
};

try {
  contextBridge.exposeInMainWorld('api', api);
} catch (err) {
  console.error('Failed to expose API to renderer:', err);
}

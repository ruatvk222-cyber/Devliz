import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type {
  AddExtensionFolderInput,
  AddExtensionStoreInput,
  AddExtensionZipInput,
  AppSettings,
  AutomationConfig,
  BulkCreateOptions,
  Profile,
  ProxyCheckResult,
  ProxyConfig,
  ProxyImportOptions,
  LauncherStatus,
  UserExtension,
} from '@shared/types';
import {
  attachExtensionToProfiles,
  deleteExtension,
  detachExtensionFromProfiles,
  listExtensions,
  listExtensionsForProfile,
} from '../repositories/extensions';
import {
  installFromFolder,
  installFromStore,
  installFromZip,
} from '../extensions/installer';
import {
  bulkCreateProfiles,
  createProfile,
  deleteProfile,
  deleteProfiles,
  duplicateProfile,
  getProfile,
  listProfiles,
  updateProfile,
} from '../repositories/profiles';
import {
  createProxy,
  deleteProxies,
  deleteProxy,
  importProxies,
  listProxies,
  updateProxy,
} from '../repositories/proxies';
import { getSettings, updateSettings } from '../repositories/settings';
import { detectChromePath } from '../launcher/chrome-path';
import {
  getRunningStatuses,
  launchProfile,
  launchProfiles,
  onLauncherStatus,
  stopAllProfiles,
  stopProfile,
} from '../launcher/manager';
import { checkProxies } from '../proxy/checker';
import { listLaunchLogs, logsDir, readLaunchLog } from '../launcher/launch-log';

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}

export function registerIpcHandlers(): void {
  // ----- Profiles
  ipcMain.handle('profiles.list', (): Profile[] => listProfiles());
  ipcMain.handle('profiles.get', (_e, id: string): Profile | null => getProfile(id));
  ipcMain.handle('profiles.create', (_e, input: Partial<Profile>): Profile => createProfile(input));
  ipcMain.handle('profiles.bulkCreate', (_e, options: BulkCreateOptions): Profile[] => bulkCreateProfiles(options));
  ipcMain.handle('profiles.update', (_e, id: string, patch: Partial<Profile>): Profile => updateProfile(id, patch));
  ipcMain.handle('profiles.delete', (_e, id: string): void => deleteProfile(id));
  ipcMain.handle('profiles.deleteMany', (_e, ids: string[]): void => deleteProfiles(ids));
  ipcMain.handle('profiles.duplicate', (_e, id: string): Profile => duplicateProfile(id));

  // ----- Proxies
  ipcMain.handle('proxies.list', (): ProxyConfig[] => listProxies());
  ipcMain.handle('proxies.create', (_e, input: Omit<ProxyConfig, 'id' | 'createdAt'>): ProxyConfig => createProxy(input));
  ipcMain.handle('proxies.update', (_e, id: string, patch: Partial<ProxyConfig>): ProxyConfig => updateProxy(id, patch));
  ipcMain.handle('proxies.delete', (_e, id: string): void => deleteProxy(id));
  ipcMain.handle('proxies.deleteMany', (_e, ids: string[]): void => deleteProxies(ids));
  ipcMain.handle('proxies.importBulk', (_e, options: ProxyImportOptions): ProxyConfig[] => importProxies(options));
  ipcMain.handle('proxies.check', async (_e, ids: string[]): Promise<ProxyCheckResult[]> => {
    return checkProxies(ids, (r) => broadcast('proxy.check.progress', r));
  });

  // ----- Launcher
  ipcMain.handle('launcher.launch', async (_e, id: string): Promise<LauncherStatus> => launchProfile(id));
  ipcMain.handle('launcher.launchMany', async (_e, ids: string[]): Promise<LauncherStatus[]> => launchProfiles(ids));
  ipcMain.handle(
    'launcher.launchWithAutomation',
    async (_e, id: string, automation: AutomationConfig): Promise<LauncherStatus> =>
      launchProfile(id, { automation }),
  );
  ipcMain.handle(
    'launcher.launchManyWithAutomation',
    async (
      _e,
      ids: string[],
      automation: AutomationConfig,
    ): Promise<LauncherStatus[]> => launchProfiles(ids, { automation }),
  );
  ipcMain.handle('launcher.stop', async (_e, id: string): Promise<void> => {
    await stopProfile(id);
  });
  ipcMain.handle('launcher.stopAll', async (): Promise<void> => stopAllProfiles());
  ipcMain.handle('launcher.status', (): LauncherStatus[] => getRunningStatuses());

  // ----- Settings
  ipcMain.handle('settings.get', (): AppSettings => getSettings());
  ipcMain.handle('settings.update', (_e, patch: Partial<AppSettings>): AppSettings => updateSettings(patch));
  ipcMain.handle('settings.detectChromePath', (): string | null => detectChromePath());

  // ----- Extensions
  ipcMain.handle('extensions.list', (): UserExtension[] => listExtensions());
  ipcMain.handle(
    'extensions.addFromFolder',
    (_e, input: AddExtensionFolderInput): UserExtension => {
      try {
        return installFromFolder(input);
      } catch (err) {
        console.error('[extensions.addFromFolder] failed:', err);
        throw err;
      }
    },
  );
  ipcMain.handle(
    'extensions.addFromZip',
    (_e, input: AddExtensionZipInput): UserExtension => {
      try {
        return installFromZip(input);
      } catch (err) {
        console.error('[extensions.addFromZip] failed:', err);
        throw err;
      }
    },
  );
  ipcMain.handle(
    'extensions.addFromStore',
    async (_e, input: AddExtensionStoreInput): Promise<UserExtension> => {
      try {
        return await installFromStore(input);
      } catch (err) {
        console.error('[extensions.addFromStore] failed:', err);
        throw err;
      }
    },
  );
  ipcMain.handle('extensions.delete', (_e, id: string): void => deleteExtension(id));
  ipcMain.handle(
    'extensions.forProfile',
    (_e, profileId: string): UserExtension[] => listExtensionsForProfile(profileId),
  );
  ipcMain.handle(
    'extensions.attach',
    (_e, extensionId: string, profileIds: string[]): void =>
      attachExtensionToProfiles(extensionId, profileIds),
  );
  ipcMain.handle(
    'extensions.detach',
    (_e, extensionId: string, profileIds: string[]): void =>
      detachExtensionFromProfiles(extensionId, profileIds),
  );
  ipcMain.handle('extensions.pickFolder', async (): Promise<string | null> => {
    const focus = BrowserWindow.getFocusedWindow();
    const result = await (focus
      ? dialog.showOpenDialog(focus, { properties: ['openDirectory'] })
      : dialog.showOpenDialog({ properties: ['openDirectory'] }));
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0] ?? null;
  });
  ipcMain.handle('extensions.pickZip', async (): Promise<string | null> => {
    const focus = BrowserWindow.getFocusedWindow();
    const result = await (focus
      ? dialog.showOpenDialog(focus, {
          properties: ['openFile'],
          filters: [{ name: 'Extension package', extensions: ['zip', 'crx'] }],
        })
      : dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [{ name: 'Extension package', extensions: ['zip', 'crx'] }],
        }));
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0] ?? null;
  });

  // ----- Diagnostics / launch logs
  ipcMain.handle('logs.list', () => listLaunchLogs());
  ipcMain.handle('logs.read', (_e, name: string): string | null => readLaunchLog(name));
  ipcMain.handle('logs.openFolder', async (): Promise<void> => {
    await shell.openPath(logsDir());
  });

  // Wire launcher events to all renderer windows.
  onLauncherStatus((status) => broadcast('launcher.status', status));
}

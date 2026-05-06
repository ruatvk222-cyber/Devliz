import { app } from 'electron';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AutomationConfig } from '@shared/types';
import {
  registerAutomation,
  type AutomationCallback,
  type AutomationRegistration,
} from '../automation/listener';

export interface PreparedAutomation {
  /** Directory of the automation extension to load with --load-extension. */
  extDir: string;
  registration: AutomationRegistration;
}

interface DevlizExtensionConfig {
  autoStart: boolean;
  readSeconds: number;
  maxItems: number;
  humanLike: boolean;
  closeOnFinish: boolean;
  webhookUrl: string;
  token: string;
}

/**
 * Resolve where the bundled automation extensions live.
 *
 * Electron-builder copies `resources/extensions/*` to `process.resourcesPath`
 * in production. In dev, we read straight from the repo so the extension can
 * be edited and reloaded without a full rebuild.
 */
function bundledExtensionsRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'extensions');
  }
  return resolve(__dirname, '..', '..', 'resources', 'extensions');
}

export function bundledAutomationDir(kind: AutomationConfig['kind']): string {
  if (kind === 'gmail-auto-reader') {
    return join(bundledExtensionsRoot(), 'gmail-auto-reader');
  }
  // Future automations: add here.
  throw new Error(`Unknown automation kind: ${String(kind)}`);
}

/**
 * Copy the bundled automation extension into the profile's data dir and write
 * a `devliz-config.json` next to its manifest so the extension's
 * background.js auto-starts and reports back to our local listener.
 *
 * Returns the on-disk dir to pass to Chrome's --load-extension AND the
 * registration handle (token, webhookUrl, unregister).
 */
export async function prepareAutomation(
  profileDataDir: string,
  config: AutomationConfig,
  onEvent: AutomationCallback,
): Promise<PreparedAutomation> {
  const source = bundledAutomationDir(config.kind);
  if (!existsSync(source)) {
    throw new Error(`Bundled automation extension not found: ${source}`);
  }

  const targetParent = join(profileDataDir, 'devliz-automation');
  mkdirSync(targetParent, { recursive: true });
  const target = join(targetParent, config.kind);

  // Refresh the on-disk copy each launch so updates to the bundled extension
  // (after an app upgrade) take effect.
  cpSync(source, target, { recursive: true });

  const registration = await registerAutomation(onEvent);

  const extConfig: DevlizExtensionConfig = {
    autoStart: true,
    readSeconds: config.readSeconds,
    maxItems: config.maxItems,
    humanLike: config.humanLike,
    closeOnFinish: config.closeOnFinish,
    webhookUrl: registration.webhookUrl,
    token: registration.token,
  };
  writeFileSync(join(target, 'devliz-config.json'), JSON.stringify(extConfig, null, 2));

  return { extDir: target, registration };
}

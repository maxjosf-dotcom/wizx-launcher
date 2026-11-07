import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { send } from './window';

// Updates kommen ueber GitHub Releases (siehe "publish" in package.json).

export function setupUpdater(): void {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => send('update', { state: 'checking' } satisfies UpdateInfo));
  autoUpdater.on('update-available', (i) =>
    send('update', { state: 'available', version: i.version } satisfies UpdateInfo),
  );
  autoUpdater.on('update-not-available', () => send('update', { state: 'none' } satisfies UpdateInfo));
  autoUpdater.on('download-progress', (p) =>
    send('update', { state: 'downloading', percent: Math.round(p.percent) } satisfies UpdateInfo),
  );
  autoUpdater.on('update-downloaded', (i) =>
    send('update', { state: 'ready', version: i.version } satisfies UpdateInfo),
  );
  autoUpdater.on('error', (e) => send('update', { state: 'error', message: e.message } satisfies UpdateInfo));

  setTimeout(() => autoUpdater.checkForUpdates().catch(() => undefined), 6000);
}

export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) {
    send('update', { state: 'dev' } satisfies UpdateInfo);
    return;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (e: any) {
    send('update', { state: 'error', message: e.message } satisfies UpdateInfo);
  }
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall();
}

import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config, save } from './store';
import { instDir, ensureDir } from './paths';
import * as auth from './auth';
import { listVersions, loaderVersions, manifest } from './meta';
import { launchInstance, runningIds } from './launch';
import * as content from './content';
import { checkForUpdates, installUpdate } from './updater';

const findInstance = (id: string): Instance => {
  const inst = config().instances.find((i) => i.id === id);
  if (!inst) throw new Error('Instanz nicht gefunden.');
  return inst;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));
const KINDS: ContentKind[] = ['mod', 'resourcepack', 'shader'];
const LOADERS: LoaderType[] = ['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'];
const kindOf = (k: unknown): ContentKind => {
  if (!KINDS.includes(k as ContentKind)) throw new Error('Ungueltiger Inhaltstyp.');
  return k as ContentKind;
};

function appState(): AppState {
  const c = config();
  return {
    settings: c.settings,
    instances: c.instances,
    selectedInstance: c.selectedInstance,
    account: auth.getAccount(),
    totalMemMb: Math.round(os.totalmem() / 1048576),
    version: app.getVersion(),
    running: runningIds(),
  };
}

export function registerIpc(): void {
  ipcMain.handle('state:get', () => appState());

  // ----- Konto -----
  ipcMain.handle('auth:login', () => auth.login());
  ipcMain.handle('auth:logout', () => auth.logout());

  // ----- Versionen -----
  ipcMain.handle('versions:list', () => listVersions());
  ipcMain.handle('loader:versions', (_e, loader: LoaderType, mc: string) => {
    if (!LOADERS.includes(loader)) throw new Error('Ungueltiger Loader.');
    return loaderVersions(loader, String(mc));
  });

  // ----- Instanzen -----
  ipcMain.handle('instance:create', async (_e, d: NewInstanceData) => {
    const name = String(d?.name ?? '').trim().slice(0, 40);
    if (!name) throw new Error('Bitte gib einen Namen ein.');
    if (!LOADERS.includes(d.loader)) throw new Error('Ungueltiger Loader.');
    const m = await manifest();
    const v = m.versions.find((x) => x.id === d.mcVersion);
    if (!v) throw new Error('Unbekannte Minecraft-Version.');
    if (d.loader !== 'vanilla' && !d.loaderVersion) throw new Error('Bitte waehle eine Loader-Version.');

    const inst: Instance = {
      id: crypto.randomBytes(6).toString('hex'),
      name,
      mcVersion: v.id,
      versionType: v.type,
      loader: d.loader,
      loaderVersion: d.loader === 'vanilla' ? undefined : d.loaderVersion,
      createdAt: Date.now(),
    };
    const dir = ensureDir(instDir(inst.id));
    for (const sub of ['mods', 'resourcepacks', 'shaderpacks', 'saves']) ensureDir(path.join(dir, sub));
    config().instances.push(inst);
    config().selectedInstance = inst.id;
    save();
    return inst;
  });

  ipcMain.handle('instance:update', (_e, id: string, patch: Partial<Instance>) => {
    const inst = findInstance(id);
    if (typeof patch?.name === 'string' && patch.name.trim()) inst.name = patch.name.trim().slice(0, 40);
    if (patch && 'ramMb' in patch) {
      inst.ramMb = typeof patch.ramMb === 'number' ? clamp(patch.ramMb, 1024, 65536) : undefined;
    }
    save();
    return inst;
  });

  ipcMain.handle('instance:delete', (_e, id: string) => {
    findInstance(id);
    if (runningIds().includes(id)) throw new Error('Die Instanz laeuft gerade.');
    fs.rmSync(instDir(id), { recursive: true, force: true });
    const c = config();
    c.instances = c.instances.filter((i) => i.id !== id);
    if (c.selectedInstance === id) c.selectedInstance = c.instances[0]?.id ?? null;
    save();
  });

  ipcMain.handle('instance:open', async (_e, id: string, sub?: string) => {
    findInstance(id);
    const allowed = ['', 'mods', 'resourcepacks', 'shaderpacks', 'saves'];
    const s = allowed.includes(sub ?? '') ? sub ?? '' : '';
    const err = await shell.openPath(ensureDir(path.join(instDir(id), s)));
    if (err) throw new Error(err);
  });

  ipcMain.handle('instance:select', (_e, id: string | null) => {
    if (id) findInstance(id);
    config().selectedInstance = id;
    save();
  });

  // ----- Einstellungen -----
  ipcMain.handle('settings:save', (_e, patch: Partial<Settings>) => {
    const s = config().settings;
    const keys: (keyof Settings)[] = ['maxRamMb', 'minRamMb', 'javaPath', 'jvmArgs', 'showSnapshots', 'closeOnLaunch', 'msClientId'];
    for (const k of keys) {
      if (patch && k in patch && typeof patch[k] === typeof s[k]) (s as any)[k] = patch[k];
    }
    s.maxRamMb = clamp(s.maxRamMb, 1024, 65536);
    s.minRamMb = clamp(s.minRamMb, 256, s.maxRamMb);
    s.msClientId = s.msClientId.trim();
    save();
    return s;
  });

  // ----- Spiel -----
  ipcMain.handle('game:launch', (_e, id: string) => launchInstance(id));

  // ----- Inhalte -----
  ipcMain.handle('content:list', (_e, id: string, kind: ContentKind) => content.listContent(findInstance(id), kindOf(kind)));
  ipcMain.handle('content:toggle', (_e, id: string, kind: ContentKind, name: string) =>
    content.toggleContent(findInstance(id), kindOf(kind), String(name)),
  );
  ipcMain.handle('content:remove', (_e, id: string, kind: ContentKind, name: string) =>
    content.removeContent(findInstance(id), kindOf(kind), String(name)),
  );
  ipcMain.handle('content:search', (_e, q: string, kind: ContentKind, id: string, offset: number) =>
    content.searchContent(findInstance(id), kindOf(kind), String(q ?? '').slice(0, 100), Number(offset) || 0),
  );
  ipcMain.handle('content:install', (_e, projectId: string, kind: ContentKind, id: string) => {
    if (!/^[A-Za-z0-9]{8}$/.test(String(projectId))) throw new Error('Ungueltige Projekt-ID.');
    return content.installContent(findInstance(id), kindOf(kind), projectId);
  });

  // ----- Fenster / System / Updates -----
  ipcMain.on('window:control', (e, action: string) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w) return;
    if (action === 'min') w.minimize();
    else if (action === 'max') (w.isMaximized() ? w.unmaximize() : w.maximize());
    else if (action === 'close') w.close();
  });
  ipcMain.on('open:external', (_e, url: string) => {
    if (typeof url === 'string' && url.startsWith('https://')) shell.openExternal(url);
  });
  ipcMain.handle('update:check', () => checkForUpdates());
  ipcMain.on('update:install', () => installUpdate());
}

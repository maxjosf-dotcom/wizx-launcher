import * as fs from 'fs';
import * as path from 'path';
import { rootDir, ensureDir } from './paths';

export interface StoredAccount {
  enc: string; // mit Electron safeStorage verschluesselter Refresh-Token (base64)
  name: string;
  uuid: string;
  skinUrl?: string;
}

export interface Config {
  settings: Settings;
  instances: Instance[];
  selectedInstance: string | null;
  account: StoredAccount | null;
}

const defaults = (): Config => ({
  settings: {
    maxRamMb: 4096,
    minRamMb: 512,
    javaPath: '',
    jvmArgs: '',
    showSnapshots: false,
    closeOnLaunch: false,
    msClientId: '',
  },
  instances: [],
  selectedInstance: null,
  account: null,
});

let cfg: Config | null = null;
const file = () => path.join(rootDir(), 'config.json');

export function config(): Config {
  if (!cfg) {
    const d = defaults();
    try {
      const raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
      cfg = { ...d, ...raw, settings: { ...d.settings, ...(raw.settings || {}) } };
    } catch {
      cfg = d;
    }
  }
  return cfg!;
}

export function save(): void {
  ensureDir(rootDir());
  const tmp = file() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(config(), null, 2), 'utf8');
  fs.renameSync(tmp, file());
}

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export const rootDir = () => path.join(app.getPath('appData'), '.wizxclient');
export const instancesDir = () => path.join(rootDir(), 'instances');
export const instDir = (id: string) => path.join(instancesDir(), id);
export const runtimeDir = () => path.join(rootDir(), 'runtime');
export const cacheDir = () => path.join(rootDir(), 'cache');

export function ensureDir(p: string): string {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

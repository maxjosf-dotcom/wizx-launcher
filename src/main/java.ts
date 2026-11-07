import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { runtimeDir, ensureDir } from './paths';
import { download, versionJson } from './meta';
import { config } from './store';

const run = promisify(execFile);
type Emit = (p: Progress) => void;

/** Welche Java-Hauptversion braucht diese Minecraft-Version? */
export async function requiredJavaMajor(mc: string): Promise<number> {
  const v = await versionJson(mc);
  return v.javaVersion?.majorVersion ?? 8;
}

function binIn(dir: string, mode: 'java' | 'javaw'): string {
  const exe = process.platform === 'win32' ? `${mode}.exe` : 'java';
  return path.join(dir, 'bin', exe);
}

/**
 * Liefert den Pfad zu java/javaw.
 * Reihenfolge: in den Einstellungen gesetzter Pfad > automatisch geladene Java-Laufzeit (Adoptium).
 */
export async function resolveJava(mc: string, mode: 'java' | 'javaw', emit: Emit): Promise<string> {
  const custom = config().settings.javaPath.trim();
  if (custom) {
    if (!fs.existsSync(custom)) throw new Error(`Der eingestellte Java-Pfad existiert nicht: ${custom}`);
    return custom;
  }

  const major = await requiredJavaMajor(mc);
  const dir = path.join(runtimeDir(), `jre-${major}`);
  if (fs.existsSync(binIn(dir, mode))) return binIn(dir, mode);

  if (process.platform !== 'win32') {
    throw new Error('Automatischer Java-Download ist nur unter Windows verfuegbar. Setze einen Java-Pfad in den Einstellungen.');
  }

  ensureDir(runtimeDir());
  const zip = path.join(runtimeDir(), `jre-${major}.zip`);
  const url = `https://api.adoptium.net/v3/binary/latest/${major}/ga/windows/x64/jre/hotspot/normal/eclipse`;
  await download(url, zip, (d, t) =>
    emit({ stage: `Java ${major} wird geladen`, percent: t ? (d / t) * 100 : 0, indeterminate: !t }),
  );

  emit({ stage: `Java ${major} wird entpackt`, percent: 0, indeterminate: true });
  const tmp = path.join(runtimeDir(), `jre-${major}-tmp`);
  fs.rmSync(tmp, { recursive: true, force: true });
  ensureDir(tmp);
  // tar.exe (bsdtar) ist ab Windows 10 enthalten und kann ZIP-Archive entpacken.
  await run('tar', ['-xf', zip, '-C', tmp], { windowsHide: true });
  const inner = fs.readdirSync(tmp).find((n) => fs.statSync(path.join(tmp, n)).isDirectory());
  if (!inner) throw new Error('Java-Archiv ist leer oder beschaedigt.');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(path.join(tmp, inner), dir);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(zip, { force: true });

  if (!fs.existsSync(binIn(dir, mode))) throw new Error('Java wurde entpackt, aber java.exe fehlt.');
  return binIn(dir, mode);
}

import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { rootDir, cacheDir, ensureDir } from './paths';
import { download, getJson } from './meta';
import { resolveJava } from './java';
import { save } from './store';

const run = promisify(execFile);
type Emit = (p: Progress) => void;

const LABEL: Record<LoaderType, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt',
};

const hasVersion = (root: string, id: string) =>
  fs.existsSync(path.join(root, 'versions', id, `${id}.json`));

/**
 * Stellt sicher, dass der Mod-Loader der Instanz installiert ist.
 * Vanilla wird beim Start von minecraft-launcher-core geladen.
 */
export async function ensureInstalled(inst: Instance, emit: Emit): Promise<void> {
  if (inst.loader === 'vanilla') return;

  const root = ensureDir(rootDir());
  const versionsDir = ensureDir(path.join(root, 'versions'));
  if (inst.versionId && hasVersion(root, inst.versionId)) return;

  const lv = inst.loaderVersion;
  if (!lv) throw new Error('Fuer diese Instanz ist keine Loader-Version gewaehlt.');
  const name = LABEL[inst.loader];
  let id: string | undefined;

  if (inst.loader === 'fabric' || inst.loader === 'quilt') {
    emit({ stage: `${name} wird installiert`, percent: 0, indeterminate: true });
    const base = inst.loader === 'fabric' ? 'https://meta.fabricmc.net/v2' : 'https://meta.quiltmc.org/v3';
    const profile = await getJson<any>(
      `${base}/versions/loader/${encodeURIComponent(inst.mcVersion)}/${encodeURIComponent(lv)}/profile/json`,
    );
    id = profile.id as string;
    ensureDir(path.join(versionsDir, id));
    fs.writeFileSync(path.join(versionsDir, id, `${id}.json`), JSON.stringify(profile, null, 2));
  } else {
    // Forge / NeoForge: offiziellen Installer headless ausfuehren
    const url =
      inst.loader === 'forge'
        ? `https://maven.minecraftforge.net/net/minecraftforge/forge/${inst.mcVersion}-${lv}/forge-${inst.mcVersion}-${lv}-installer.jar`
        : `https://maven.neoforged.net/releases/net/neoforged/neoforge/${lv}/neoforge-${lv}-installer.jar`;
    const jar = path.join(ensureDir(cacheDir()), `${inst.loader}-${inst.mcVersion}-${lv}-installer.jar`);
    if (!fs.existsSync(jar)) {
      await download(url, jar, (d, t) =>
        emit({ stage: `${name}-Installer wird geladen`, percent: t ? (d / t) * 100 : 0, indeterminate: !t }),
      );
    }

    const profiles = path.join(root, 'launcher_profiles.json');
    if (!fs.existsSync(profiles)) fs.writeFileSync(profiles, JSON.stringify({ profiles: {}, version: 3 }));

    const java = await resolveJava(inst.mcVersion, 'java', emit);
    const before = new Set(fs.readdirSync(versionsDir));
    emit({ stage: `${name} wird installiert (kann einige Minuten dauern)`, percent: 0, indeterminate: true });
    try {
      await run(java, ['-jar', jar, '--installClient', root], {
        windowsHide: true,
        maxBuffer: 1 << 27,
        timeout: 20 * 60 * 1000,
      });
    } catch (e: any) {
      fs.rmSync(jar, { force: true });
      const tail = String(e.stderr || e.stdout || e.message).slice(-400);
      throw new Error(`${name}-Installer fehlgeschlagen: ${tail}`);
    }

    const expected = inst.loader === 'forge' ? `${inst.mcVersion}-forge-${lv}` : `neoforge-${lv}`;
    if (hasVersion(root, expected)) {
      id = expected;
    } else {
      id = fs.readdirSync(versionsDir).find((d) => !before.has(d) && hasVersion(root, d));
    }
  }

  if (!id || !hasVersion(root, id)) throw new Error(`${name} konnte nicht installiert werden.`);
  inst.versionId = id;
  save();
}

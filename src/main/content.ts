import * as fs from 'fs';
import * as path from 'path';
import { instDir, ensureDir } from './paths';
import { download, getJson } from './meta';

// Mods, Resource Packs und Shader kommen von Modrinth (offene API, kein Schluessel noetig).

const API = 'https://api.modrinth.com/v2';

const FOLDER: Record<ContentKind, string> = {
  mod: 'mods',
  resourcepack: 'resourcepacks',
  shader: 'shaderpacks',
};
const EXT: Record<ContentKind, string[]> = {
  mod: ['.jar'],
  resourcepack: ['.zip'],
  shader: ['.zip'],
};

const folder = (inst: Instance, kind: ContentKind) => ensureDir(path.join(instDir(inst.id), FOLDER[kind]));

/** Modrinth-Loader, die zu einer Instanz passen (Quilt kann auch Fabric-Mods laden). */
function loadersFor(inst: Instance): string[] | null {
  switch (inst.loader) {
    case 'vanilla':
      return null;
    case 'quilt':
      return ['quilt', 'fabric'];
    default:
      return [inst.loader];
  }
}

// ---------- Installierte Dateien ----------

export function listContent(inst: Instance, kind: ContentKind): ContentFile[] {
  const dir = folder(inst, kind);
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((n) => EXT[kind].some((x) => n.toLowerCase().endsWith(x) || n.toLowerCase().endsWith(x + '.disabled')))
    .map((n) => ({
      name: n,
      size: fs.statSync(path.join(dir, n)).size,
      enabled: !n.endsWith('.disabled'),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function safePath(inst: Instance, kind: ContentKind, name: string): string {
  return path.join(folder(inst, kind), path.basename(name));
}

export function toggleContent(inst: Instance, kind: ContentKind, name: string): void {
  const p = safePath(inst, kind, name);
  if (!fs.existsSync(p)) throw new Error('Datei nicht gefunden.');
  fs.renameSync(p, p.endsWith('.disabled') ? p.slice(0, -'.disabled'.length) : p + '.disabled');
}

export function removeContent(inst: Instance, kind: ContentKind, name: string): void {
  fs.rmSync(safePath(inst, kind, name), { force: true });
}

// ---------- Suche ----------

export async function searchContent(
  inst: Instance,
  kind: ContentKind,
  query: string,
  offset: number,
): Promise<SearchResult> {
  const facets: string[][] = [[`project_type:${kind}`], [`versions:${inst.mcVersion}`]];
  const loaders = kind === 'mod' ? loadersFor(inst) : null;
  if (loaders) facets.push(loaders.map((l) => `categories:${l}`));

  const url =
    `${API}/search?` +
    new URLSearchParams({
      query,
      facets: JSON.stringify(facets),
      limit: '20',
      offset: String(Math.max(0, offset)),
      index: query ? 'relevance' : 'downloads',
    });
  const r = await getJson<any>(url);
  return {
    total: r.total_hits ?? 0,
    hits: (r.hits as any[]).map((h) => ({
      id: h.project_id,
      slug: h.slug,
      title: h.title,
      description: h.description,
      icon: h.icon_url || null,
      downloads: h.downloads || 0,
      author: h.author || '',
    })),
  };
}

// ---------- Installation (inkl. benoetigter Abhaengigkeiten) ----------

async function installProject(
  inst: Instance,
  kind: ContentKind,
  projectId: string,
  done: Set<string>,
  installed: string[],
): Promise<void> {
  if (done.has(projectId)) return;
  done.add(projectId);

  const params = new URLSearchParams({ game_versions: JSON.stringify([inst.mcVersion]) });
  const loaders = kind === 'mod' ? loadersFor(inst) : null;
  if (loaders) params.set('loaders', JSON.stringify(loaders));

  const versions = await getJson<any[]>(`${API}/project/${encodeURIComponent(projectId)}/version?${params}`);
  if (!versions.length) {
    throw new Error(`Keine kompatible Version fuer Minecraft ${inst.mcVersion}${loaders ? ' (' + loaders[0] + ')' : ''} gefunden.`);
  }
  const version = versions.find((v) => v.version_type === 'release') ?? versions[0];
  const file = (version.files as any[]).find((f) => f.primary) ?? version.files[0];
  if (!file) throw new Error('Die Version enthaelt keine Datei.');

  const dest = path.join(folder(inst, kind), path.basename(file.filename));
  if (!fs.existsSync(dest) && !fs.existsSync(dest + '.disabled')) {
    await download(file.url, dest, undefined, file.hashes?.sha1);
    installed.push(path.basename(file.filename));
  }

  if (kind === 'mod') {
    for (const dep of version.dependencies as any[]) {
      if (dep.dependency_type === 'required' && dep.project_id) {
        await installProject(inst, kind, dep.project_id, done, installed);
      }
    }
  }
}

export async function installContent(inst: Instance, kind: ContentKind, projectId: string): Promise<string[]> {
  const installed: string[] = [];
  await installProject(inst, kind, projectId, new Set(), installed);
  return installed;
}

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { createWriteStream } from 'fs';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';

const UA = 'WizXClient/1.0 (Minecraft Launcher)';

export async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers } });
  if (!res.ok) throw new Error(`Anfrage fehlgeschlagen (${res.status}): ${new URL(url).host}`);
  return (await res.json()) as T;
}

export async function getText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Anfrage fehlgeschlagen (${res.status}): ${new URL(url).host}`);
  return res.text();
}

export async function download(
  url: string,
  dest: string,
  onProgress?: (done: number, total: number) => void,
  sha1?: string,
): Promise<void> {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok || !res.body) throw new Error(`Download fehlgeschlagen (${res.status}): ${new URL(url).host}`);
  const total = Number(res.headers.get('content-length') || 0);
  let done = 0;
  const hash = crypto.createHash('sha1');
  const part = dest + '.part';
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      done += chunk.length;
      hash.update(chunk);
      onProgress?.(done, total);
      cb(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body as any), counter, createWriteStream(part));
  if (sha1 && hash.digest('hex') !== sha1.toLowerCase()) {
    fs.rmSync(part, { force: true });
    throw new Error('Pruefsumme der heruntergeladenen Datei stimmt nicht.');
  }
  fs.renameSync(part, dest);
}

// ---------- Mojang ----------

interface ManifestEntry {
  id: string;
  type: string;
  url: string;
  releaseTime: string;
}
interface Manifest {
  latest: { release: string; snapshot: string };
  versions: ManifestEntry[];
}

let manifestCache: { at: number; data: Manifest } | null = null;
const versionCache = new Map<string, any>();

export async function manifest(): Promise<Manifest> {
  if (manifestCache && Date.now() - manifestCache.at < 10 * 60 * 1000) return manifestCache.data;
  const data = await getJson<Manifest>('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
  manifestCache = { at: Date.now(), data };
  return data;
}

export async function versionJson(mc: string): Promise<any> {
  if (versionCache.has(mc)) return versionCache.get(mc);
  const m = await manifest();
  const entry = m.versions.find((v) => v.id === mc);
  if (!entry) throw new Error(`Minecraft-Version ${mc} nicht gefunden.`);
  const json = await getJson<any>(entry.url);
  versionCache.set(mc, json);
  return json;
}

export async function listVersions(): Promise<VersionList> {
  const m = await manifest();
  return {
    latestRelease: m.latest.release,
    latestSnapshot: m.latest.snapshot,
    versions: m.versions
      .filter((v) => v.type === 'release' || v.type === 'snapshot')
      .map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime })),
  };
}

// ---------- Mod-Loader ----------

function metaVersions(xml: string): string[] {
  return [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);
}

function neoPrefix(mc: string): string | null {
  const m = /^1\.(\d+)(?:\.(\d+))?$/.exec(mc);
  return m ? `${m[1]}.${m[2] ?? '0'}.` : null;
}

export async function loaderVersions(loader: LoaderType, mc: string): Promise<string[]> {
  const e = encodeURIComponent(mc);
  switch (loader) {
    case 'vanilla':
      return [];
    case 'fabric': {
      const r = await getJson<any[]>(`https://meta.fabricmc.net/v2/versions/loader/${e}`);
      return r.map((x) => x.loader.version as string);
    }
    case 'quilt': {
      const r = await getJson<any[]>(`https://meta.quiltmc.org/v3/versions/loader/${e}`);
      return r.map((x) => x.loader.version as string);
    }
    case 'forge': {
      const xml = await getText('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml');
      return metaVersions(xml)
        .filter((v) => v.startsWith(mc + '-'))
        .map((v) => v.slice(mc.length + 1))
        .reverse();
    }
    case 'neoforge': {
      const prefix = neoPrefix(mc);
      if (!prefix) return [];
      const xml = await getText('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml');
      return metaVersions(xml)
        .filter((v) => v.startsWith(prefix))
        .reverse();
    }
  }
}

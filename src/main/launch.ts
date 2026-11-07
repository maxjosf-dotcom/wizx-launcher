import * as crypto from 'crypto';
import { ChildProcess } from 'child_process';
import { Client } from 'minecraft-launcher-core';
import { config, save } from './store';
import { rootDir, instDir, ensureDir } from './paths';
import { ensureSession } from './auth';
import { ensureInstalled } from './install';
import { resolveJava } from './java';
import { send } from './window';

const running = new Map<string, ChildProcess>();
const busy = new Set<string>();

export const runningIds = (): string[] => [...running.keys()];

const progress = (p: Progress) => send('progress', p);

/** Installiert/prueft alles und startet Minecraft. Resolved, sobald das Spiel laeuft. */
export async function launchInstance(id: string): Promise<void> {
  const inst = config().instances.find((i) => i.id === id);
  if (!inst) throw new Error('Instanz nicht gefunden.');
  if (busy.has(id) || running.has(id)) throw new Error('Diese Instanz startet bereits oder laeuft.');
  busy.add(id);

  try {
    const settings = config().settings;

    progress({ stage: 'Anmeldung wird geprueft', percent: 0, indeterminate: true });
    const session = await ensureSession();

    await ensureInstalled(inst, progress);
    const javaPath = await resolveJava(inst.mcVersion, 'javaw', progress);

    const maxMb = inst.ramMb ?? settings.maxRamMb;
    const minMb = Math.min(settings.minRamMb, maxMb);
    const gameDir = ensureDir(instDir(inst.id));

    const launcher = new Client();
    launcher.on('progress', (e: any) => {
      if (e && e.total) {
        progress({ stage: `Lade ${e.type}`, percent: (e.task / e.total) * 100 });
      }
    });
    launcher.on('package-extract', () => progress({ stage: 'Dateien werden entpackt', percent: 0, indeterminate: true }));
    launcher.on('debug', (m: string) => send('log', String(m)));
    launcher.on('data', (m: string) => send('log', String(m)));
    launcher.on('close', (code: number) => {
      running.delete(id);
      send('game-state', { id, state: 'stopped', code } satisfies GameState);
    });

    const opts: any = {
      authorization: {
        access_token: session.accessToken,
        client_token: crypto.randomUUID(),
        uuid: session.account.uuid,
        name: session.account.name,
        user_properties: '{}',
        meta: { type: 'msa', demo: false },
      },
      root: ensureDir(rootDir()),
      javaPath,
      version: {
        number: inst.mcVersion,
        type: inst.versionType === 'snapshot' ? 'snapshot' : 'release',
        ...(inst.loader !== 'vanilla' && inst.versionId ? { custom: inst.versionId } : {}),
      },
      memory: { max: `${maxMb}M`, min: `${minMb}M` },
      overrides: { gameDirectory: gameDir, detached: false },
    };
    const extra = settings.jvmArgs.trim();
    if (extra) opts.customArgs = extra.split(/\s+/);

    progress({ stage: 'Minecraft wird vorbereitet', percent: 0, indeterminate: true });
    const child: ChildProcess | null = await launcher.launch(opts);
    if (!child) throw new Error('Minecraft konnte nicht gestartet werden. Details stehen im Launcher-Log.');

    running.set(id, child);
    inst.lastPlayed = Date.now();
    save();
    send('game-state', { id, state: 'running' } satisfies GameState);
  } finally {
    busy.delete(id);
    send('progress', null);
  }
}

import * as crypto from 'crypto';
import * as http from 'http';
import { shell, safeStorage } from 'electron';
import { config, save } from './store';

// Microsoft-Anmeldung per OAuth 2.0 Authorization-Code-Flow mit PKCE (kein Client-Secret,
// Passwort wird nur auf der Microsoft-Seite im Browser eingegeben).
// Danach: Xbox Live -> XSTS -> Minecraft Services.

const AUTH = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const SCOPE = 'XboxLive.signin offline_access';

interface Session {
  accessToken: string;
  expiresAt: number;
  account: Account;
}
let session: Session | null = null;

function clientId(): string {
  const id = (process.env.WIZX_MS_CLIENT_ID || config().settings.msClientId || '').trim();
  if (!id) {
    throw new Error('Keine Microsoft-Client-ID hinterlegt. Trage sie unter Einstellungen > Microsoft ein (siehe README).');
  }
  return id;
}

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* leere Antwort */
  }
  if (!res.ok) {
    const err: any = new Error(`HTTP ${res.status}`);
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

async function tokenRequest(params: Record<string, string>): Promise<{ access_token: string; refresh_token: string }> {
  const res = await fetch(`${AUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId(), scope: SCOPE, ...params }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description?.split('\r')[0] || data.error || `Microsoft-Anmeldung fehlgeschlagen (${res.status})`);
  return data;
}

const XSTS_ERRORS: Record<number, string> = {
  2148916233: 'Dieses Microsoft-Konto hat kein Xbox-Profil. Erstelle eines auf xbox.com und versuche es erneut.',
  2148916235: 'Xbox Live ist in deinem Land nicht verfuegbar.',
  2148916236: 'Das Konto benoetigt eine Altersverifizierung (xbox.com).',
  2148916237: 'Das Konto benoetigt eine Altersverifizierung (xbox.com).',
  2148916238: 'Kinderkonto: Ein Erwachsener muss das Konto zu einer Microsoft-Familie hinzufuegen.',
};

async function minecraftLogin(msAccessToken: string): Promise<Session> {
  const xbl = await postJson('https://user.auth.xboxlive.com/user/authenticate', {
    Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msAccessToken}` },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT',
  });

  let xsts: any;
  try {
    xsts = await postJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
      Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT',
    });
  } catch (e: any) {
    const msg = XSTS_ERRORS[e.data?.XErr];
    if (msg) throw new Error(msg);
    throw e;
  }

  const uhs = xsts.DisplayClaims.xui[0].uhs;
  let mc: any;
  try {
    mc = await postJson('https://api.minecraftservices.com/authentication/login_with_xbox', {
      identityToken: `XBL3.0 x=${uhs};${xsts.Token}`,
    });
  } catch (e: any) {
    if (e.status === 403) {
      throw new Error('Minecraft-Login abgelehnt (403). Die Azure-App muss bei Mojang freigeschaltet sein (siehe README).');
    }
    throw e;
  }

  const profRes = await fetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${mc.access_token}` },
  });
  if (profRes.status === 404) throw new Error('Dieses Konto besitzt Minecraft: Java Edition nicht.');
  if (!profRes.ok) throw new Error(`Profil konnte nicht geladen werden (${profRes.status}).`);
  const prof: any = await profRes.json();
  const skin = (prof.skins || []).find((s: any) => s.state === 'ACTIVE') || prof.skins?.[0];

  return {
    accessToken: mc.access_token,
    expiresAt: Date.now() + (mc.expires_in ?? 86400) * 1000,
    account: {
      name: prof.name,
      uuid: prof.id,
      skinUrl: skin?.url ? String(skin.url).replace(/^http:/, 'https:') : undefined,
    },
  };
}

function persist(s: Session, refreshToken: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    // Ohne sichere Verschluesselung wird nichts dauerhaft gespeichert.
    config().account = null;
    save();
    return;
  }
  config().account = {
    enc: safeStorage.encryptString(refreshToken).toString('base64'),
    name: s.account.name,
    uuid: s.account.uuid,
    skinUrl: s.account.skinUrl,
  };
  save();
}

function waitForCode(state: string): Promise<{ code: string; redirect: string; close: () => void; port: number }> {
  return new Promise((resolveStart, rejectStart) => {
    let finish!: (v: string) => void;
    let fail!: (e: Error) => void;
    const codePromise = new Promise<string>((res, rej) => {
      finish = res;
      fail = rej;
    });

    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://localhost');
      const html = (title: string, text: string) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          `<!doctype html><meta charset="utf-8"><title>WizX Client</title><body style="margin:0;height:100vh;display:grid;place-items:center;background:#0a0b1e;color:#e8e6ff;font-family:Segoe UI,sans-serif"><div style="text-align:center"><h1 style="color:#a78bfa">${title}</h1><p>${text}</p></div></body>`,
        );
      };
      if (url.pathname !== '/') {
        res.writeHead(404).end();
        return;
      }
      if (url.searchParams.get('state') !== state) {
        res.writeHead(400).end('Ungueltiger state');
        return;
      }
      const err = url.searchParams.get('error_description') || url.searchParams.get('error');
      const code = url.searchParams.get('code');
      if (err || !code) {
        html('Anmeldung fehlgeschlagen', 'Du kannst dieses Fenster schliessen.');
        fail(new Error(err || 'Kein Code erhalten.'));
      } else {
        html('Angemeldet!', 'Du kannst dieses Fenster schliessen und zu WizX Client zurueckkehren.');
        finish(code);
      }
    });

    server.on('error', rejectStart);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port as number;
      const timer = setTimeout(() => fail(new Error('Zeitueberschreitung bei der Anmeldung.')), 5 * 60 * 1000);
      const close = () => {
        clearTimeout(timer);
        server.close();
      };
      // codePromise wird beim Aufrufer abgewartet
      (resolveStart as any)({
        port,
        redirect: `http://localhost:${port}`,
        close,
        get code() {
          return codePromise;
        },
      });
    });
  });
}

export async function login(): Promise<Account> {
  const id = clientId();
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');

  const srv: any = await waitForCode(state);
  try {
    const url =
      `${AUTH}/authorize?` +
      new URLSearchParams({
        client_id: id,
        response_type: 'code',
        redirect_uri: srv.redirect,
        response_mode: 'query',
        scope: SCOPE,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      });
    await shell.openExternal(url);
    const code: string = await srv.code;
    const tokens = await tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: srv.redirect,
      code_verifier: verifier,
    });
    session = await minecraftLogin(tokens.access_token);
    persist(session, tokens.refresh_token);
    return session.account;
  } finally {
    srv.close();
  }
}

export function getAccount(): Account | null {
  const a = config().account;
  return a ? { name: a.name, uuid: a.uuid, skinUrl: a.skinUrl } : null;
}

export function logout(): void {
  session = null;
  config().account = null;
  save();
}

/** Liefert eine gueltige Minecraft-Sitzung, erneuert sie bei Bedarf ueber den Refresh-Token. */
export async function ensureSession(): Promise<Session> {
  if (session && session.expiresAt - Date.now() > 2 * 60 * 1000) return session;

  const stored = config().account;
  if (!stored) throw new Error('Nicht angemeldet.');
  let refresh: string;
  try {
    refresh = safeStorage.decryptString(Buffer.from(stored.enc, 'base64'));
  } catch {
    logout();
    throw new Error('Gespeicherte Anmeldung ist ungueltig. Bitte melde dich erneut an.');
  }

  let tokens;
  try {
    tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh });
  } catch {
    logout();
    throw new Error('Die Anmeldung ist abgelaufen. Bitte melde dich erneut an.');
  }
  session = await minecraftLogin(tokens.access_token);
  persist(session, tokens.refresh_token || refresh);
  return session;
}

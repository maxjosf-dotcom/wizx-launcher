declare const api: Api;

type View = 'home' | 'instances' | 'content' | 'discover' | 'settings';

const LOADERS: Record<LoaderType, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt',
};
const KINDS: Record<ContentKind, string> = { mod: 'Mods', resourcepack: 'Resource Packs', shader: 'Shader' };

const ICONS: Record<string, string> = {
  home: '<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/>',
  layers: '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36z"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  play: '<path d="M6 4l14 8-14 8z" fill="currentColor"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
};
const icon = (name: string, size = 18) =>
  `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

interface RState {
  app: AppState;
  view: View;
  versions: VersionList | null;
  progress: Progress | null;
  launching: Set<string>;
  kind: ContentKind;
  query: string;
  hits: SearchHit[];
  total: number;
  installing: Set<string>;
  update: UpdateInfo;
  pendingPlay: string | null;
  seq: number;
}
let S!: RState;

// ---------- Hilfsfunktionen ----------

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const msg = (e: any): string =>
  String(e?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const gb = (mb: number) => `${(mb / 1024).toFixed(mb % 1024 ? 1 : 0)} GB`;
const fmtSize = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fmtNum = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} Mio.` : n >= 1e3 ? `${Math.round(n / 1e3)} Tsd.` : String(n));

function ago(ts?: number): string {
  if (!ts) return 'Noch nie gespielt';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'Gerade eben';
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  return `vor ${d} Tag${d === 1 ? '' : 'en'}`;
}

function toast(text: string, kind: 'ok' | 'err' | '' = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  byId('toast-root').appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }, kind === 'err' ? 7000 : 3500);
}

function modal(html: string) {
  byId('modal-root').innerHTML = `<div class="backdrop" data-action="backdrop"><div class="modal">${html}</div></div>`;
}
const closeModal = (): void => {
  byId('modal-root').innerHTML = '';
};

const current = (): Instance | null =>
  S.app.instances.find((i) => i.id === S.app.selectedInstance) ?? S.app.instances[0] ?? null;

type PlayState = 'idle' | 'launching' | 'running';
const playState = (id: string): PlayState =>
  S.app.running.includes(id) ? 'running' : S.launching.has(id) ? 'launching' : 'idle';

// ---------- Skin-Kopf ----------

const skins = new Map<string, HTMLImageElement>();
function drawHead(c: HTMLCanvasElement, url: string, fallback: string) {
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const paint = (img: HTMLImageElement) => {
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 8, 8, 8, 8, 0, 0, c.width, c.height);
    ctx.drawImage(img, 40, 8, 8, 8, 0, 0, c.width, c.height);
  };
  const letter = () => {
    ctx.fillStyle = '#7c3aed';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(fallback.slice(0, 1).toUpperCase(), c.width / 2, c.height / 2 + 7);
  };
  if (!url) return letter();
  const cached = skins.get(url);
  if (cached) return paint(cached);
  const img = new Image();
  img.onload = () => {
    skins.set(url, img);
    paint(img);
  };
  img.onerror = letter;
  img.src = url;
}
const hydrateHeads = () =>
  document.querySelectorAll<HTMLCanvasElement>('canvas[data-skin]').forEach((c) => drawHead(c, c.dataset.skin || '', c.dataset.name || '?'));

// ---------- Bausteine ----------

function tile(i: Instance) {
  return `<div class="itile l-${i.loader}">${esc(i.name.slice(0, 1).toUpperCase())}</div>`;
}

function playBtn(id: string, big = false) {
  const st = playState(id);
  const label = st === 'running' ? 'Läuft' : st === 'launching' ? 'Startet…' : 'Spielen';
  return `<button class="btn primary ${big ? 'big' : ''} ${st !== 'idle' ? 'busy' : ''}" data-action="play" data-id="${id}" ${st !== 'idle' ? 'disabled' : ''}>${icon('play', 18)}<span class="plabel">${label}</span></button>`;
}

function instCard(i: Instance, extended = false) {
  const st = playState(i.id);
  return `<div class="icard ${i.id === current()?.id ? 'sel' : ''}" data-action="select-instance" data-id="${i.id}">
    ${tile(i)}
    <div class="imeta"><div class="iname">${esc(i.name)}</div>
      <div class="tags"><span class="tag">${esc(i.mcVersion)}</span><span class="tag l-${i.loader}">${LOADERS[i.loader]}</span></div></div>
    <button class="iplay ${st !== 'idle' ? 'busy' : ''}" data-action="play" data-id="${i.id}" title="Spielen">${icon('play', 16)}</button>
    <div class="ifoot"><span>${ago(i.lastPlayed)}</span>
      ${
        extended
          ? `<span><button class="icon-btn" data-action="open-content" data-id="${i.id}" title="Inhalte">${icon('layers', 16)}</button><button class="icon-btn" data-action="open-folder" data-id="${i.id}" title="Ordner öffnen">${icon('folder', 16)}</button><button class="icon-btn del" data-action="delete-instance" data-id="${i.id}" title="Löschen">${icon('trash', 16)}</button></span>`
          : ''
      }
    </div></div>`;
}

// ---------- Ansichten ----------

const views: Record<View, () => string> = {
  home() {
    const inst = current();
    const s = S.app.settings;
    const maxMem = Math.max(2048, Math.floor(S.app.totalMemMb / 512) * 512);
    const recent = [...S.app.instances].sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0)).slice(0, 3);
    const v = S.versions;
    return `<div class="home"><div>
      <h2 class="h">Schnellstart</h2>
      <div class="card quick">
        ${inst ? playBtn(inst.id, true) : `<button class="btn primary big" data-action="new-instance">${icon('plus')} Instanz erstellen</button>`}
        <div class="qsel">${
          inst
            ? `${tile(inst)}<div><b>${esc(inst.name)}</b><small>${esc(inst.mcVersion)} · ${LOADERS[inst.loader]} · ${ago(inst.lastPlayed)}</small></div>`
            : '<div><b>Keine Instanz</b><small>Erstelle deine erste Instanz</small></div>'
        }</div>
        <div class="qram"><div class="lab"><span>RAM</span><b id="ram-lab">${gb(s.maxRamMb)} / ${gb(S.app.totalMemMb)}</b></div>
          <input type="range" id="ram" min="1024" max="${maxMem}" step="512" value="${Math.min(s.maxRamMb, maxMem)}"></div>
      </div>
      <div class="row-h"><h2 class="h">Deine Instanzen</h2><button class="btn ghost sm" data-action="new-instance">${icon('plus', 14)} Neu</button></div>
      <div class="grid">${recent.map((i) => instCard(i)).join('')}
        <div class="icard add" data-action="new-instance">${icon('plus', 22)}<span>Neue Instanz</span></div></div>
    </div>
    <aside class="card news"><h3>Neuigkeiten</h3>
      ${v ? `<div class="news-item"><b>Minecraft ${esc(v.latestRelease)}</b><small>Aktuelle Release-Version</small></div><div class="news-item"><b>Snapshot ${esc(v.latestSnapshot)}</b><small>Neueste Entwicklungsversion</small></div>` : '<div class="news-item"><small>Lade Versionsinfos…</small></div>'}
      <div class="news-item"><b>WizX Client v${esc(S.app.version)}</b><small>Mods, Resource Packs und Shader findest du unter „Entdecken“.</small></div>
      <div class="news-item"><b>Tipp</b><small>Benötigte Mod-Abhängigkeiten (z. B. Fabric API) werden automatisch mitinstalliert.</small></div>
    </aside></div>`;
  },

  instances() {
    return `<div class="page-h"><h1>Instanzen</h1><button class="btn primary" data-action="new-instance">${icon('plus', 16)} Neue Instanz</button></div>
      ${
        S.app.instances.length
          ? `<div class="grid">${S.app.instances.map((i) => instCard(i, true)).join('')}</div>`
          : '<div class="card empty"><h3>Noch keine Instanzen</h3>Erstelle eine Instanz mit der Minecraft-Version und dem Mod-Loader deiner Wahl.</div>'
      }`;
  },

  content() {
    const inst = current();
    if (!inst) return '<div class="card empty"><h3>Keine Instanz</h3>Erstelle zuerst eine Instanz.</div>';
    return `<div class="page-h"><h1>${esc(inst.name)} <span class="muted" style="font-size:15px">· Inhalte</span></h1>
      <span><button class="btn ghost sm" data-action="open-folder" data-id="${inst.id}" data-sub="${kindFolder(S.kind)}">${icon('folder', 14)} Ordner</button>
      <button class="btn primary sm" data-action="nav" data-view="discover">${icon('compass', 14)} Mehr entdecken</button></span></div>
      ${tabs('content-tab')}
      <div class="list" id="content-list"><div class="muted">Lade…</div></div>`;
  },

  discover() {
    const inst = current();
    if (!inst) return '<div class="card empty"><h3>Keine Instanz</h3>Erstelle zuerst eine Instanz, um Inhalte zu installieren.</div>';
    const warn =
      S.kind === 'mod' && inst.loader === 'vanilla'
        ? '<div class="notice">Diese Instanz hat keinen Mod-Loader. Erstelle eine Fabric-, Forge-, NeoForge- oder Quilt-Instanz, damit Mods funktionieren.</div>'
        : '';
    return `<div class="page-h"><h1>Entdecken <span class="muted" style="font-size:15px">· für ${esc(inst.name)} (${esc(inst.mcVersion)})</span></h1></div>
      ${warn}${tabs('discover-kind')}
      <div id="results" class="list"></div>`;
  },

  settings() {
    const s = S.app.settings;
    const maxMem = Math.max(2048, Math.floor(S.app.totalMemMb / 512) * 512);
    return `<div class="page-h"><h1>Einstellungen</h1></div><div class="set-grid">
      <div class="card set-card"><h3>Arbeitsspeicher</h3>
        <div class="field"><div class="lab"><span>Maximaler RAM</span><b id="s-max-lab">${gb(s.maxRamMb)}</b></div>
          <input type="range" data-setting="maxRamMb" data-label="s-max-lab" min="1024" max="${maxMem}" step="512" value="${Math.min(s.maxRamMb, maxMem)}"></div>
        <div class="field"><div class="lab"><span>Minimaler RAM</span><b id="s-min-lab">${gb(s.minRamMb)}</b></div>
          <input type="range" data-setting="minRamMb" data-label="s-min-lab" min="256" max="${maxMem}" step="256" value="${s.minRamMb}"></div>
      </div>
      <div class="card set-card"><h3>Java</h3>
        <div class="field"><label>Java-Pfad (java.exe / javaw.exe)</label><input type="text" data-setting="javaPath" value="${esc(s.javaPath)}" placeholder="Leer lassen = automatisch">
          <small>Leer: WizX lädt die passende Java-Version automatisch (Adoptium).</small></div>
        <div class="field"><label>Zusätzliche JVM-Argumente</label><input type="text" data-setting="jvmArgs" value="${esc(s.jvmArgs)}" placeholder="z. B. -XX:+UseG1GC"></div>
      </div>
      <div class="card set-card"><h3>Launcher</h3>
        <div class="toggle-row"><span>Snapshots in der Versionsliste anzeigen</span><span class="switch"><input type="checkbox" data-setting="showSnapshots" ${s.showSnapshots ? 'checked' : ''}><i></i></span></div>
        <div class="toggle-row"><span>Launcher beim Spielstart minimieren</span><span class="switch"><input type="checkbox" data-setting="closeOnLaunch" ${s.closeOnLaunch ? 'checked' : ''}><i></i></span></div>
      </div>
      <div class="card set-card"><h3>Microsoft-Anmeldung</h3>
        <div class="field"><label>Azure Client-ID (Anwendungs-ID)</label><input type="text" data-setting="msClientId" value="${esc(s.msClientId)}" placeholder="00000000-0000-0000-0000-000000000000">
          <small>Wird für die sichere Anmeldung (OAuth mit PKCE) benötigt. Anleitung: README.md.</small></div>
        ${S.app.account ? `<button class="btn danger sm" data-action="logout">Abmelden (${esc(S.app.account.name)})</button>` : ''}
      </div>
      <div class="card set-card"><h3>Updates</h3>
        <div class="toggle-row"><span id="upd-text">${updText()}</span><span>
          <button class="btn ghost sm" data-action="check-update">Nach Updates suchen</button>
          ${S.update.state === 'ready' ? '<button class="btn primary sm" data-action="install-update">Jetzt neu starten</button>' : ''}</span></div>
        <small class="muted">WizX Launcher v${esc(S.app.version)}</small>
      </div></div>`;
  },
};

const kindFolder = (k: ContentKind) => ({ mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' })[k];

function tabs(action: string) {
  return `<div class="tabs">${(Object.keys(KINDS) as ContentKind[])
    .map((k) => `<button class="tab ${S.kind === k ? 'active' : ''}" data-action="${action}" data-kind="${k}">${KINDS[k]}</button>`)
    .join('')}</div>`;
}

function updText(): string {
  const u = S.update;
  switch (u.state) {
    case 'checking': return 'Suche nach Updates…';
    case 'available': return `Update ${u.version ?? ''} gefunden, wird geladen…`;
    case 'downloading': return `Update wird geladen (${u.percent ?? 0} %)`;
    case 'ready': return `Update ${u.version ?? ''} ist bereit.`;
    case 'none': return 'Der Launcher ist aktuell.';
    case 'dev': return 'Updates sind nur in der installierten Version verfügbar.';
    case 'error': return `Update-Fehler: ${u.message ?? ''}`;
    default: return 'Automatische Updates über GitHub Releases.';
  }
}

// ---------- Rendering ----------

function renderChrome() {
  const items: [View, string, string][] = [
    ['home', 'home', 'Start'],
    ['instances', 'box', 'Instanzen'],
    ['content', 'layers', 'Inhalte'],
    ['discover', 'compass', 'Entdecken'],
    ['settings', 'sliders', 'Einstellungen'],
  ];
  byId('nav').innerHTML = items
    .map(([v, ic, label]) => `<button class="nav-item ${S.view === v ? 'active' : ''}" data-action="nav" data-view="${v}">${icon(ic)}<span>${label}</span></button>`)
    .join('');

  const recent = [...S.app.instances].filter((i) => i.lastPlayed).sort((a, b) => b.lastPlayed! - a.lastPlayed!).slice(0, 3);
  byId('recent').innerHTML = recent.length
    ? recent.map((i) => `<button class="recent-item" data-action="select-instance" data-id="${i.id}">${tile(i)}<span><b>${esc(i.name)}</b><small>${esc(i.mcVersion)}</small></span></button>`).join('')
    : '<div class="side-empty">Noch nichts gespielt</div>';

  const a = S.app.account;
  byId('side-acc').innerHTML = a
    ? `<button class="side-acc-btn" data-action="nav" data-view="settings"><canvas class="head" width="32" height="32" data-skin="${esc(a.skinUrl ?? '')}" data-name="${esc(a.name)}"></canvas><span><b>${esc(a.name)}</b><small>Angemeldet</small></span></button>`
    : `<button class="btn primary" style="width:100%" data-action="login-modal">Mit Microsoft anmelden</button>`;
  byId('top-acc').innerHTML = a
    ? `<div class="chip" data-action="acc-menu"><canvas class="head" width="32" height="32" data-skin="${esc(a.skinUrl ?? '')}" data-name="${esc(a.name)}"></canvas><span>${esc(a.name)}</span>${icon('chev', 14)}<div class="menu"><button data-action="logout">Abmelden</button></div></div>`
    : '';
  byId('search-wrap').innerHTML = `${icon('search', 16)}<input id="topsearch" type="text" placeholder="Mods, Resource Packs, Shader suchen…" value="${esc(S.query)}">`;
  byId('st-ver').textContent = `WizX v${S.app.version}`;
  renderStatus();
  hydrateHeads();
}

function renderView(animate: boolean) {
  const v = byId('view');
  v.innerHTML = views[S.view]();
  if (animate) {
    v.classList.remove('enter');
    void v.offsetWidth;
    v.classList.add('enter');
    v.scrollTop = 0;
  }
  hydrateHeads();
  wireSliders();
  if (S.view === 'content') void loadContent();
  if (S.view === 'discover') void runSearch(true);
}

function navigate(view: View) {
  S.view = view;
  renderChrome();
  renderView(true);
}

function renderStatus() {
  const p = S.progress;
  const bar = byId('st-bar');
  byId('st-text').textContent = p ? p.stage : 'Bereit';
  bar.classList.toggle('on', !!p);
  bar.classList.toggle('indet', !!p?.indeterminate);
  byId('st-fill').style.width = p ? `${Math.max(2, Math.min(100, p.percent))}%` : '0%';
  byId('st-pct').textContent = p && !p.indeterminate ? `${Math.round(p.percent)} %` : '';
  byId('st-mem').textContent = `${gb(S.app.settings.maxRamMb)} / ${gb(S.app.totalMemMb)} RAM`;
  const u = S.update.state;
  byId('st-upd').textContent = u === 'ready' ? 'Update bereit' : u === 'downloading' ? `Update ${S.update.percent ?? 0} %` : '';
}

function refreshPlay() {
  document.querySelectorAll<HTMLButtonElement>('[data-action="play"]').forEach((b) => {
    const st = playState(b.dataset.id!);
    b.classList.toggle('busy', st !== 'idle');
    b.disabled = st !== 'idle';
    const l = b.querySelector('.plabel');
    if (l) l.textContent = st === 'running' ? 'Läuft' : st === 'launching' ? 'Startet…' : 'Spielen';
  });
}

function fillSlider(el: HTMLInputElement) {
  const min = Number(el.min), max = Number(el.max);
  el.style.setProperty('--fill', `${((Number(el.value) - min) / (max - min)) * 100}%`);
}
function wireSliders() {
  document.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(fillSlider);
}

// ---------- Inhalte & Entdecken ----------

async function loadContent() {
  const inst = current();
  if (!inst) return;
  const box = byId('content-list');
  try {
    const files = await api.listContent(inst.id, S.kind);
    box.innerHTML = files.length
      ? files.map((f, i) => `<div class="row ${f.enabled ? '' : 'off'}" style="animation-delay:${Math.min(i, 12) * 25}ms">
          <div class="grow"><div class="nm">${esc(f.name.replace(/\.disabled$/, ''))}</div><small>${fmtSize(f.size)}${f.enabled ? '' : ' · deaktiviert'}</small></div>
          <span class="switch" title="Aktivieren/Deaktivieren"><input type="checkbox" data-action="toggle-file" data-name="${esc(f.name)}" ${f.enabled ? 'checked' : ''}><i></i></span>
          <button class="icon-btn del" data-action="remove-file" data-name="${esc(f.name)}" title="Entfernen">${icon('trash', 16)}</button></div>`).join('')
      : `<div class="card empty"><h3>Keine ${KINDS[S.kind]} installiert</h3>Im Bereich „Entdecken“ findest du welche.</div>`;
  } catch (e) {
    box.innerHTML = `<div class="notice">${esc(msg(e))}</div>`;
  }
}

async function runSearch(reset: boolean) {
  const inst = current();
  const box = document.getElementById('results');
  if (!inst || !box) return;
  const my = ++S.seq;
  if (reset) {
    S.hits = [];
    S.total = 0;
    box.innerHTML = '<div class="muted">Suche…</div>';
  }
  try {
    const r = await api.searchContent(S.query, S.kind, inst.id, S.hits.length);
    if (my !== S.seq) return;
    S.hits = reset ? r.hits : S.hits.concat(r.hits);
    S.total = r.total;
    box.innerHTML = S.hits.length
      ? S.hits.map(hitHtml).join('') + (S.hits.length < S.total ? '<button class="btn ghost" data-action="more">Mehr laden</button>' : '')
      : `<div class="card empty"><h3>Nichts gefunden</h3>Für Minecraft ${esc(inst.mcVersion)} gibt es keine passenden Ergebnisse.</div>`;
  } catch (e) {
    if (my === S.seq) box.innerHTML = `<div class="notice">${esc(msg(e))}</div>`;
  }
}

function hitHtml(h: SearchHit, i: number) {
  const busy = S.installing.has(h.id);
  return `<div class="card hit" style="animation-delay:${Math.min(i % 20, 12) * 25}ms">
    ${h.icon ? `<img class="pic" src="${esc(h.icon)}" alt="">` : `<div class="pic">${esc(h.title.slice(0, 1))}</div>`}
    <div class="grow"><div class="ht">${esc(h.title)}<span class="by">von ${esc(h.author)}</span></div><div class="hd">${esc(h.description)}</div><div class="hm">${fmtNum(h.downloads)} Downloads</div></div>
    <button class="btn primary sm ${busy ? 'busy' : ''}" data-action="install" data-id="${esc(h.id)}" ${busy ? 'disabled' : ''}>${icon('download', 14)}<span class="plabel">${busy ? 'Lädt' : 'Installieren'}</span></button></div>`;
}

// ---------- Modals ----------

function openLogin(err = '') {
  modal(`<h3>Mit Microsoft anmelden</h3>
    <p>Die Anmeldung läuft sicher im Browser über Microsoft (OAuth mit PKCE). WizX sieht dein Passwort nie. Du brauchst ein Konto, das Minecraft: Java Edition besitzt.</p>
    ${err ? `<div class="notice">${esc(err)}</div>` : ''}
    <div class="actions"><button class="btn ghost" data-action="close-modal">Abbrechen</button><button class="btn primary" data-action="do-login">Im Browser anmelden</button></div>`);
}

async function doLogin() {
  modal(`<div class="center"><div class="spin"></div><h3>Warte auf Anmeldung…</h3><p>Schließe die Anmeldung im Browser ab. Danach geht es hier automatisch weiter.</p></div>`);
  try {
    S.app.account = await api.login();
    closeModal();
    renderChrome();
    toast(`Angemeldet als ${S.app.account.name}`, 'ok');
    if (S.view === 'settings') renderView(false);
    if (S.pendingPlay) {
      const id = S.pendingPlay;
      S.pendingPlay = null;
      void play(id);
    }
  } catch (e) {
    openLogin(msg(e));
  }
}

async function openCreate() {
  if (!S.versions) {
    try {
      S.versions = await api.listVersions();
    } catch (e) {
      toast(msg(e), 'err');
      return;
    }
  }
  modal(`<h3>Neue Instanz</h3>
    <label>Name<input type="text" id="cm-name" maxlength="40" placeholder="z. B. Survival"></label>
    <div class="two">
      <label>Minecraft-Version<select id="cm-mc"></select></label>
      <label>Mod-Loader<select id="cm-loader">${(Object.keys(LOADERS) as LoaderType[]).map((l) => `<option value="${l}">${LOADERS[l]}</option>`).join('')}</select></label>
    </div>
    <label class="chk"><input type="checkbox" id="cm-snap" ${S.app.settings.showSnapshots ? 'checked' : ''}> Snapshots anzeigen</label>
    <label id="cm-lvw" hidden>Loader-Version<select id="cm-lv"></select></label>
    <div class="actions"><button class="btn ghost" data-action="close-modal">Abbrechen</button><button class="btn primary" id="cm-create">Erstellen</button></div>`);

  const mc = byId<HTMLSelectElement>('cm-mc');
  const loader = byId<HTMLSelectElement>('cm-loader');
  const lv = byId<HTMLSelectElement>('cm-lv');
  const create = byId<HTMLButtonElement>('cm-create');
  let n = 0;

  const loadLv = async () => {
    const l = loader.value as LoaderType;
    byId('cm-lvw').hidden = l === 'vanilla';
    create.disabled = false;
    if (l === 'vanilla') return;
    const my = ++n;
    lv.disabled = true;
    create.disabled = true;
    lv.innerHTML = '<option>Lade…</option>';
    try {
      const list = await api.listLoaderVersions(l, mc.value);
      if (my !== n) return;
      lv.innerHTML = list.length
        ? list.slice(0, 60).map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('')
        : '<option value="">Keine Version verfügbar</option>';
      lv.disabled = !list.length;
      create.disabled = !list.length;
    } catch (e) {
      if (my !== n) return;
      lv.innerHTML = '<option value="">Fehler beim Laden</option>';
      toast(msg(e), 'err');
    }
  };
  const fillMc = () => {
    const snap = byId<HTMLInputElement>('cm-snap').checked;
    mc.innerHTML = S.versions!.versions
      .filter((v) => snap || v.type === 'release')
      .map((v) => `<option value="${esc(v.id)}">${esc(v.id)}${v.type === 'snapshot' ? ' (Snapshot)' : ''}</option>`)
      .join('');
    void loadLv();
  };
  byId('cm-snap').addEventListener('change', fillMc);
  mc.addEventListener('change', () => void loadLv());
  loader.addEventListener('change', () => void loadLv());
  create.addEventListener('click', async () => {
    const v = S.versions!.versions.find((x) => x.id === mc.value);
    try {
      const inst = await api.createInstance({
        name: byId<HTMLInputElement>('cm-name').value,
        mcVersion: mc.value,
        versionType: v?.type ?? 'release',
        loader: loader.value as LoaderType,
        loaderVersion: loader.value === 'vanilla' ? undefined : lv.value,
      });
      S.app.instances.push(inst);
      S.app.selectedInstance = inst.id;
      closeModal();
      toast(`Instanz „${inst.name}“ erstellt`, 'ok');
      navigate('instances');
    } catch (e) {
      toast(msg(e), 'err');
    }
  });
  fillMc();
  byId('cm-name').focus();
}

// ---------- Aktionen ----------

async function play(id: string) {
  if (playState(id) !== 'idle') return;
  if (!S.app.account) {
    S.pendingPlay = id;
    openLogin();
    return;
  }
  S.launching.add(id);
  refreshPlay();
  try {
    await api.launch(id);
    const inst = S.app.instances.find((i) => i.id === id);
    if (inst) inst.lastPlayed = Date.now();
    if (S.app.settings.closeOnLaunch) api.windowControl('min');
  } catch (e) {
    toast(msg(e), 'err');
  } finally {
    S.launching.delete(id);
    S.progress = null;
    renderStatus();
    renderChrome();
    refreshPlay();
  }
}

function askDelete(id: string) {
  const inst = S.app.instances.find((i) => i.id === id);
  if (!inst) return;
  modal(`<h3>Instanz löschen?</h3><p>„${esc(inst.name)}“ wird samt Welten, Mods und Einstellungen unwiderruflich gelöscht.</p>
    <div class="actions"><button class="btn ghost" data-action="close-modal">Abbrechen</button><button class="btn danger" data-action="confirm-delete" data-id="${id}">Löschen</button></div>`);
}

const actions: Record<string, (el: HTMLElement) => void | Promise<void>> = {
  nav: (el) => navigate(el.dataset.view as View),
  win: (el) => api.windowControl(el.dataset.w as 'min' | 'max' | 'close'),
  'close-modal': closeModal,
  backdrop: () => undefined,
  'acc-menu': (el) => {
    el.classList.toggle('open');
  },
  'login-modal': () => openLogin(),
  'do-login': doLogin,
  logout: async () => {
    await api.logout();
    S.app.account = null;
    renderChrome();
    if (S.view === 'settings') renderView(false);
    toast('Abgemeldet');
  },
  play: (el) => play(el.dataset.id!),
  'new-instance': openCreate,
  'select-instance': async (el) => {
    await api.selectInstance(el.dataset.id!);
    S.app.selectedInstance = el.dataset.id!;
    renderChrome();
    document.querySelectorAll('.icard').forEach((c) => c.classList.toggle('sel', (c as HTMLElement).dataset.id === el.dataset.id));
  },
  'open-content': async (el) => {
    await api.selectInstance(el.dataset.id!);
    S.app.selectedInstance = el.dataset.id!;
    navigate('content');
  },
  'open-folder': (el) => api.openInstanceFolder(el.dataset.id!, el.dataset.sub),
  'delete-instance': (el) => askDelete(el.dataset.id!),
  'confirm-delete': async (el) => {
    await api.deleteInstance(el.dataset.id!);
    S.app.instances = S.app.instances.filter((i) => i.id !== el.dataset.id);
    if (S.app.selectedInstance === el.dataset.id) S.app.selectedInstance = S.app.instances[0]?.id ?? null;
    closeModal();
    renderChrome();
    renderView(false);
    toast('Instanz gelöscht');
  },
  'content-tab': (el) => {
    S.kind = el.dataset.kind as ContentKind;
    renderView(false);
  },
  'discover-kind': (el) => {
    S.kind = el.dataset.kind as ContentKind;
    renderView(false);
  },
  'toggle-file': async (el) => {
    const inst = current();
    if (inst) await api.toggleContent(inst.id, S.kind, el.dataset.name!);
    await loadContent();
  },
  'remove-file': async (el) => {
    const inst = current();
    if (inst) await api.removeContent(inst.id, S.kind, el.dataset.name!);
    await loadContent();
  },
  more: () => runSearch(false),
  install: async (el) => {
    const inst = current();
    if (!inst) return;
    const id = el.dataset.id!;
    S.installing.add(id);
    await runSearchRender();
    try {
      const done = await api.installContent(id, S.kind, inst.id);
      toast(done.length ? `Installiert: ${done.join(', ')}` : 'Bereits installiert', 'ok');
    } catch (e) {
      toast(msg(e), 'err');
    } finally {
      S.installing.delete(id);
      await runSearchRender();
    }
  },
  'check-update': () => api.checkUpdates(),
  'install-update': () => api.installUpdate(),
};

/** Ergebnisliste neu zeichnen, ohne neu zu suchen. */
async function runSearchRender() {
  const box = document.getElementById('results');
  if (!box) return;
  box.innerHTML = S.hits.map(hitHtml).join('') + (S.hits.length < S.total ? '<button class="btn ghost" data-action="more">Mehr laden</button>' : '');
}

document.addEventListener('click', (ev) => {
  const target = ev.target as HTMLElement;
  if (!target.closest('.chip')) document.querySelectorAll('.chip.open').forEach((c) => c.classList.remove('open'));
  const el = target.closest<HTMLElement>('[data-action]');
  if (!el) return;
  if (el.dataset.action === 'backdrop' && target !== el) return;
  if (el.dataset.action === 'backdrop') return closeModal();
  const fn = actions[el.dataset.action!];
  if (fn) Promise.resolve(fn(el)).catch((e) => toast(msg(e), 'err'));
});

// Slider / Eingabefelder / Schalter
document.addEventListener('input', (ev) => {
  const t = ev.target as HTMLInputElement;
  if (t.type !== 'range') return;
  fillSlider(t);
  if (t.id === 'ram') byId('ram-lab').textContent = `${gb(Number(t.value))} / ${gb(S.app.totalMemMb)}`;
  if (t.dataset.label) byId(t.dataset.label).textContent = gb(Number(t.value));
});

document.addEventListener('change', async (ev) => {
  const t = ev.target as HTMLInputElement;
  const key = (t.id === 'ram' ? 'maxRamMb' : t.dataset.setting) as keyof Settings | undefined;
  if (!key) return;
  const value = t.type === 'checkbox' ? t.checked : t.type === 'range' ? Number(t.value) : t.value;
  try {
    S.app.settings = await api.saveSettings({ [key]: value } as Partial<Settings>);
    renderStatus();
  } catch (e) {
    toast(msg(e), 'err');
  }
});

document.addEventListener('keydown', (ev) => {
  const t = ev.target as HTMLInputElement;
  if (ev.key === 'Enter' && t.id === 'topsearch') {
    S.query = t.value.trim();
    S.kind = 'mod';
    navigate('discover');
  }
  if (ev.key === 'Escape') closeModal();
});

// ---------- Start ----------

async function init() {
  S = {
    app: await api.getState(),
    view: 'home',
    versions: null,
    progress: null,
    launching: new Set(),
    kind: 'mod',
    query: '',
    hits: [],
    total: 0,
    installing: new Set(),
    update: { state: 'idle' },
    pendingPlay: null,
    seq: 0,
  };

  api.on('progress', (p: Progress | null) => {
    S.progress = p;
    renderStatus();
  });
  api.on('game-state', (g: GameState) => {
    S.app.running = g.state === 'running' ? [...new Set([...S.app.running, g.id])] : S.app.running.filter((x) => x !== g.id);
    if (g.state === 'stopped' && g.code) toast(`Minecraft wurde beendet (Code ${g.code}).`, 'err');
    refreshPlay();
  });
  api.on('update', (u: UpdateInfo) => {
    S.update = u;
    renderStatus();
    const t = document.getElementById('upd-text');
    if (t) t.textContent = updText();
    if (u.state === 'ready') toast(`Update ${u.version ?? ''} ist bereit. Installation unter Einstellungen.`, 'ok');
  });

  renderChrome();
  renderView(true);
  api.listVersions().then((v) => {
    S.versions = v;
    if (S.view === 'home') renderView(false);
  }).catch(() => undefined);
}

init().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:60px;color:#f87171">${esc(msg(e))}</pre>`);
});

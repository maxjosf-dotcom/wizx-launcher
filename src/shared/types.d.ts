// Gemeinsame, globale Typen fuer Main-, Preload- und Renderer-Prozess.

type LoaderType = 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt';
type ContentKind = 'mod' | 'resourcepack' | 'shader';

interface Settings {
  maxRamMb: number;
  minRamMb: number;
  javaPath: string;
  jvmArgs: string;
  showSnapshots: boolean;
  closeOnLaunch: boolean;
  msClientId: string;
}

interface Instance {
  id: string;
  name: string;
  mcVersion: string;
  versionType: string;
  loader: LoaderType;
  loaderVersion?: string;
  versionId?: string;
  ramMb?: number;
  createdAt: number;
  lastPlayed?: number;
}

interface Account {
  name: string;
  uuid: string;
  skinUrl?: string;
}

interface GameVersion {
  id: string;
  type: string;
  releaseTime: string;
}

interface VersionList {
  latestRelease: string;
  latestSnapshot: string;
  versions: GameVersion[];
}

interface Progress {
  stage: string;
  percent: number;
  indeterminate?: boolean;
}

interface ContentFile {
  name: string;
  size: number;
  enabled: boolean;
}

interface SearchHit {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string | null;
  downloads: number;
  author: string;
}

interface SearchResult {
  hits: SearchHit[];
  total: number;
}

interface UpdateInfo {
  state: 'idle' | 'dev' | 'checking' | 'available' | 'none' | 'downloading' | 'ready' | 'error';
  version?: string;
  percent?: number;
  message?: string;
}

interface GameState {
  id: string;
  state: 'running' | 'stopped';
  code?: number | null;
}

interface AppState {
  settings: Settings;
  instances: Instance[];
  selectedInstance: string | null;
  account: Account | null;
  totalMemMb: number;
  version: string;
  running: string[];
}

interface NewInstanceData {
  name: string;
  mcVersion: string;
  versionType: string;
  loader: LoaderType;
  loaderVersion?: string;
}

interface Api {
  getState(): Promise<AppState>;
  login(): Promise<Account>;
  logout(): Promise<void>;
  listVersions(): Promise<VersionList>;
  listLoaderVersions(loader: LoaderType, mc: string): Promise<string[]>;
  createInstance(d: NewInstanceData): Promise<Instance>;
  updateInstance(id: string, patch: Partial<Instance>): Promise<Instance>;
  deleteInstance(id: string): Promise<void>;
  openInstanceFolder(id: string, sub?: string): Promise<void>;
  selectInstance(id: string | null): Promise<void>;
  saveSettings(patch: Partial<Settings>): Promise<Settings>;
  launch(id: string): Promise<void>;
  listContent(id: string, kind: ContentKind): Promise<ContentFile[]>;
  toggleContent(id: string, kind: ContentKind, name: string): Promise<void>;
  removeContent(id: string, kind: ContentKind, name: string): Promise<void>;
  searchContent(query: string, kind: ContentKind, id: string, offset: number): Promise<SearchResult>;
  installContent(projectId: string, kind: ContentKind, id: string): Promise<string[]>;
  windowControl(action: 'min' | 'max' | 'close'): void;
  openExternal(url: string): void;
  checkUpdates(): Promise<void>;
  installUpdate(): void;
  on(channel: 'progress' | 'log' | 'game-state' | 'update', cb: (data: any) => void): void;
}

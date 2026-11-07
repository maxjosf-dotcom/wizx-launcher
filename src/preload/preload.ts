import { contextBridge, ipcRenderer } from 'electron';

const inv = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
const CHANNELS = ['progress', 'log', 'game-state', 'update'];

const api: Api = {
  getState: () => inv('state:get'),
  login: () => inv('auth:login'),
  logout: () => inv('auth:logout'),
  listVersions: () => inv('versions:list'),
  listLoaderVersions: (loader, mc) => inv('loader:versions', loader, mc),
  createInstance: (d) => inv('instance:create', d),
  updateInstance: (id, patch) => inv('instance:update', id, patch),
  deleteInstance: (id) => inv('instance:delete', id),
  openInstanceFolder: (id, sub) => inv('instance:open', id, sub),
  selectInstance: (id) => inv('instance:select', id),
  saveSettings: (patch) => inv('settings:save', patch),
  launch: (id) => inv('game:launch', id),
  listContent: (id, kind) => inv('content:list', id, kind),
  toggleContent: (id, kind, name) => inv('content:toggle', id, kind, name),
  removeContent: (id, kind, name) => inv('content:remove', id, kind, name),
  searchContent: (q, kind, id, offset) => inv('content:search', q, kind, id, offset),
  installContent: (projectId, kind, id) => inv('content:install', projectId, kind, id),
  windowControl: (action) => ipcRenderer.send('window:control', action),
  openExternal: (url) => ipcRenderer.send('open:external', url),
  checkUpdates: () => inv('update:check'),
  installUpdate: () => ipcRenderer.send('update:install'),
  on: (channel, cb) => {
    if (!CHANNELS.includes(channel)) return;
    ipcRenderer.on(channel, (_e, data) => cb(data));
  },
};

contextBridge.exposeInMainWorld('api', api);

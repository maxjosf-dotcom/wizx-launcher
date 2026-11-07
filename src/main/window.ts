import { BrowserWindow } from 'electron';

let win: BrowserWindow | null = null;

export const setWindow = (w: BrowserWindow | null) => {
  win = w;
};

export const getWindow = () => win;

export const send = (channel: string, data: unknown) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
};

import type { ContentItem } from '../models/content';

type BrowserFileWritable = {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
};

type BrowserFileHandle = {
  createWritable(): Promise<BrowserFileWritable>;
};

type BrowserWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<BrowserFileHandle>;
};

export function getBrowserDownloadFileName(item: ContentItem) {
  const title = item.title
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim() || 'Geniuzplus video';
  const pathExtension = item.mediaPath?.split(/[?#]/, 1)[0]?.match(/\.([^.\/]+)$/)?.[1];
  const extension = (item.fileExtension ?? pathExtension)?.replace(/^\./, '').toLowerCase();
  return `${title}${extension && /^[a-z0-9]{1,10}$/.test(extension) ? `.${extension}` : ''}`;
}

export function beginBrowserFileSave(item: ContentItem) {
  if (typeof window === 'undefined') {
    return Promise.resolve<BrowserFileWritable | null>(null);
  }
  const browserWindow = window as BrowserWindow;
  if (!browserWindow.showSaveFilePicker) {
    return Promise.resolve<BrowserFileWritable | null>(null);
  }
  const fileName = getBrowserDownloadFileName(item);
  const extension = fileName.lastIndexOf('.') > 0
    ? fileName.slice(fileName.lastIndexOf('.'))
    : undefined;
  return browserWindow
    .showSaveFilePicker({
      suggestedName: fileName,
      ...(extension
        ? { types: [{ description: 'Video', accept: { 'video/*': [extension] } }] }
        : {}),
    })
    .then((handle) => handle.createWritable());
}

export function startBrowserManagedDownload(url: string, fileName: string) {
  if (typeof document === 'undefined') {
    return false;
  }
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.append(link);
  try {
    link.click();
    return true;
  } catch {
    return false;
  } finally {
    link.remove();
  }
}

export type { BrowserFileWritable };

// Saves downloaded videos inside the browser so they play offline in the web app.
import type { ContentItem } from '../models/content';
import { MAX_VIDEO_FILE_SIZE_BYTES } from '../constants/video';
import type { BrowserFileWritable } from './browserDownload';

const DB_NAME = 'geniuz-offline';
const CHUNK_BYTES = 8 * 1024 * 1024;

export type WebOfflineMeta = { id: string; title: string; size: number; chunks: number; type: string; savedAt: number; item?: ContentItem };

const objectUrls = new Map<string, string>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('meta', { keyPath: 'id' });
      req.result.createObjectStore('chunks');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function finish(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function removeFromOffline(id: string): Promise<void> {
  const objectUrl = objectUrls.get(id);
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrls.delete(id);
  }
  const db = await openDb();
  const tx = db.transaction(['meta', 'chunks'], 'readwrite');
  tx.objectStore('meta').delete(id);
  tx.objectStore('chunks').delete(IDBKeyRange.bound(id + ':', id + ':\uffff'));
  await finish(tx);
  db.close();
}

export async function saveToOffline(
  item: ContentItem,
  url: string,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
  fileWriter?: BrowserFileWritable | null,
): Promise<void> {
  const expectedSize = item.fileSizeBytes;
  if (!Number.isSafeInteger(expectedSize) || !expectedSize || expectedSize <= 0 || expectedSize > MAX_VIDEO_FILE_SIZE_BYTES) {
    throw new Error('This title has no valid browser download size.');
  }
  const res = await fetch(url, { signal });
  if (!res.ok || !res.body) throw new Error('Download failed (' + res.status + ').');
  const total = Number(res.headers.get('content-length') ?? expectedSize);
  if (Number.isFinite(total) && total > MAX_VIDEO_FILE_SIZE_BYTES) {
    throw new Error('This video exceeds the 1 GB download limit.');
  }
  const type = res.headers.get('content-type') || 'video/mp4';
  try { await navigator.storage?.persist?.(); } catch {}
  await removeFromOffline(item.id);
  const db = await openDb();
  try {
    const reader = res.body.getReader();
    let parts: Uint8Array[] = [];
    let partBytes = 0, index = 0, received = 0;
    const flush = async () => {
      if (!partBytes) return;
      const tx = db.transaction('chunks', 'readwrite');
      tx.objectStore('chunks').put(new Blob(parts as unknown as BlobPart[], { type }), item.id + ':' + index);
      await finish(tx);
      index += 1; parts = []; partBytes = 0;
    };
    for (;;) {
      if (signal?.aborted) throw new Error('Download canceled.');
      const { done, value } = await reader.read();
      if (done) break;
      if (fileWriter) await fileWriter.write(value);
      parts.push(value); partBytes += value.length; received += value.length;
      if (received > MAX_VIDEO_FILE_SIZE_BYTES || received > expectedSize) {
        await reader.cancel();
        throw new Error('The downloaded file exceeded its verified size.');
      }
      if (partBytes >= CHUNK_BYTES) await flush();
      onProgress?.(total ? Math.round((received / total) * 100) : 0);
    }
    if (received !== expectedSize) throw new Error('The downloaded file size did not match. Retry while online.');
    await flush();
    const meta: WebOfflineMeta = { id: item.id, title: item.title, item, size: received, chunks: index, type, savedAt: Date.now() };
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(meta);
    await finish(tx);
  } catch (e) {
    db.close();
    await removeFromOffline(item.id).catch(() => {});
    throw e;
  }
  db.close();
}

export async function listOffline(): Promise<WebOfflineMeta[]> {
  const db = await openDb();
  const out = await new Promise<WebOfflineMeta[]>((resolve, reject) => {
    const req = db.transaction('meta').objectStore('meta').getAll();
    req.onsuccess = () => resolve(req.result as WebOfflineMeta[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return out;
}

export async function getOfflineUrl(id: string): Promise<string | null> {
  const cachedUrl = objectUrls.get(id);
  if (cachedUrl) return cachedUrl;
  const db = await openDb();
  const meta = await new Promise<WebOfflineMeta | undefined>((resolve, reject) => {
    const req = db.transaction('meta').objectStore('meta').get(id);
    req.onsuccess = () => resolve(req.result as WebOfflineMeta | undefined);
    req.onerror = () => reject(req.error);
  });
  if (!meta) { db.close(); return null; }
  const store = db.transaction('chunks').objectStore('chunks');
  const blobs: Blob[] = [];
  for (let i = 0; i < meta.chunks; i += 1) {
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const req = store.get(id + ':' + i);
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!blob) {
      db.close();
      return null;
    }
    blobs.push(blob);
  }
  db.close();
  const url = URL.createObjectURL(new Blob(blobs, { type: meta.type }));
  objectUrls.set(id, url);
  return url;
}

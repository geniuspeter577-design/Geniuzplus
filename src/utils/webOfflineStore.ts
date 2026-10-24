// Saves downloaded videos inside the browser so they play offline in the web app.
const DB_NAME = 'geniuz-offline';
const CHUNK_BYTES = 8 * 1024 * 1024;

export type WebOfflineMeta = { id: string; title: string; size: number; chunks: number; type: string; savedAt: number };

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
  const db = await openDb();
  const tx = db.transaction(['meta', 'chunks'], 'readwrite');
  tx.objectStore('meta').delete(id);
  tx.objectStore('chunks').delete(IDBKeyRange.bound(id + ':', id + ':\uffff'));
  await finish(tx);
  db.close();
}

export async function saveToOffline(
  id: string, title: string, url: string, onProgress?: (percent: number) => void,
): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error('Download failed (' + res.status + ').');
  const total = Number(res.headers.get('content-length') ?? 0);
  const type = res.headers.get('content-type') || 'video/mp4';
  try { await navigator.storage?.persist?.(); } catch {}
  await removeFromOffline(id);
  const db = await openDb();
  try {
    const reader = res.body.getReader();
    let parts: Uint8Array[] = [];
    let partBytes = 0, index = 0, received = 0;
    const flush = async () => {
      if (!partBytes) return;
      const tx = db.transaction('chunks', 'readwrite');
      tx.objectStore('chunks').put(new Blob(parts as unknown as BlobPart[], { type }), id + ':' + index);
      await finish(tx);
      index += 1; parts = []; partBytes = 0;
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value); partBytes += value.length; received += value.length;
      if (partBytes >= CHUNK_BYTES) await flush();
      onProgress?.(total ? Math.round((received / total) * 100) : 0);
    }
    await flush();
    const meta: WebOfflineMeta = { id, title, size: received, chunks: index, type, savedAt: Date.now() };
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(meta);
    await finish(tx);
  } catch (e) {
    db.close();
    await removeFromOffline(id).catch(() => {});
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
    blobs.push(await new Promise<Blob>((resolve, reject) => {
      const req = store.get(id + ':' + i);
      req.onsuccess = () => resolve(req.result as Blob);
      req.onerror = () => reject(req.error);
    }));
  }
  db.close();
  return URL.createObjectURL(new Blob(blobs, { type: meta.type }));
}

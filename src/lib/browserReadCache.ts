// Only complete, server-confirmed result sets are stored. No Auth credentials.
const DATABASE = 'rev4-read-cache-v1';
const RETENTION = 30 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_ENTRIES = 150;
type Entry = { key: string; savedAt: number; rows: unknown[]; bytes: number };
const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown[]>>();
let opening: Promise<IDBDatabase | null> | undefined;
let generation = 0;
const invalidations = new Map<string, number>();
const revisionFor = (key: string) => {
  let revision = 0;
  for (const [prefix, value] of invalidations) if (key.startsWith(prefix)) revision = Math.max(revision, value);
  return revision;
};
let channel: BroadcastChannel | undefined;

function database() {
  return opening ??= new Promise<IDBDatabase | null>(resolve => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    try {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('results', { keyPath: 'key' });
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); opening = undefined; };
        resolve(request.result);
      };
      request.onerror = request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function entries(): Promise<Entry[]> {
  const db = await database();
  if (!db) return [...memory.values()];
  return new Promise(resolve => {
    try {
      const tx = db.transaction('results', 'readonly');
      const request = tx.objectStore('results').getAll();
      tx.oncomplete = () => resolve(request.result || []);
      tx.onerror = tx.onabort = () => resolve([]);
    } catch { resolve([]); }
  });
}
async function remove(keys: string[]) {
  for (const key of keys) memory.delete(key);
  const db = await database();
  if (!db || !keys.length) return;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction('results', 'readwrite');
      keys.forEach(key => tx.objectStore('results').delete(key));
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    } catch { resolve(); }
  });
}
export async function getStoredRows(key: string): Promise<unknown[] | null> {
  let entry = memory.get(key);
  if (!entry) {
    const db = await database();
    if (db) entry = await new Promise<Entry | undefined>(resolve => {
      try {
        const tx = db.transaction('results', 'readonly');
        const request = tx.objectStore('results').get(key);
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = tx.onabort = () => resolve(undefined);
      } catch { resolve(undefined); }
    });
  }
  if (!entry || entry.savedAt > Date.now() || Date.now() - entry.savedAt > RETENTION || !Array.isArray(entry.rows)) return null;
  memory.set(key, entry);
  return structuredClone(entry.rows);
}
export async function storeRows(key: string, rows: unknown[]) {
  const entry: Entry = { key, savedAt: Date.now(), rows: structuredClone(rows), bytes: new Blob([JSON.stringify(rows)]).size };
  if (entry.bytes > MAX_BYTES) return;
  memory.set(key, entry);
  const db = await database();
  if (db) await new Promise<void>(resolve => {
    try {
      const tx = db.transaction('results', 'readwrite');
      tx.objectStore('results').put(entry);
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    } catch { resolve(); }
  });
  const combined = new Map((await entries()).map(row => [row.key, row]));
  for (const [id, row] of memory) combined.set(id, row);
  const all = [...combined.values()].sort((a, b) => b.savedAt - a.savedAt);
  let bytes = 0;
  await remove(all.filter((row, index) => {
    bytes += row.bytes;
    return index >= MAX_ENTRIES || bytes > MAX_BYTES || Date.now() - row.savedAt > RETENTION;
  }).map(row => row.key));
}
export function cachedRows<T>(key: string, load: () => Promise<T[]>, persist = true): Promise<T[]> {
  let pending = inflight.get(key);
  if (!pending) {
    const revision = revisionFor(key);
    const read = async () => {
      const saved = persist ? await getStoredRows(key) : memory.get(key)?.rows;
      if (saved) return structuredClone(saved);
      const rows = await load();
      if (revision === revisionFor(key)) {
        if (persist) await storeRows(key, rows);
        else memory.set(key, { key, rows: structuredClone(rows), savedAt: Date.now(), bytes: 0 });
      }
      return rows;
    };
    // A lock lets the next tab recheck IndexedDB after the first tab finishes.
    pending = typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request(`rev4:${key}`, read) : read();
    inflight.set(key, pending);
    void pending.finally(() => { if (inflight.get(key) === pending) inflight.delete(key); }).catch(() => {});
  }
  return pending as Promise<T[]>;
}
function notify(prefix: string) {
  for (const key of inflight.keys()) if (key.startsWith(prefix)) inflight.delete(key);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('rev4-cache-changed'));
}
export async function invalidateRows(prefix: string, broadcast = true) {
  invalidations.set(prefix, ++generation);
  await remove((await entries()).filter(row => row.key.startsWith(prefix)).map(row => row.key));
  for (const key of memory.keys()) if (key.startsWith(prefix)) memory.delete(key);
  notify(prefix);
  if (broadcast) channel?.postMessage({ prefix });
}
if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
  channel = new BroadcastChannel('rev4-cache-invalidation-v1');
  channel.onmessage = event => {
    if (typeof event.data?.prefix === 'string') void invalidateRows(event.data.prefix, false);
  };
}
export function readNamespace(account: { uid: string | null; account: { id: string; role: string; branch: string } | null }) {
  return JSON.stringify([account.uid, account.account?.id, account.account?.role, account.account?.branch]) + '|';
}
// Date fallback rolls over automatically after the daily import window (22:15 Riyadh).
export function fallbackRevision(now = new Date()) {
  return new Date(now.getTime() + (4 * 60 + 45) * 60 * 1000).toISOString().slice(0, 10);
}

export function stableJSON(value: unknown): string {
  const normalize = (input: unknown): unknown => Array.isArray(input) ? input.map(normalize)
    : input && typeof input === 'object' ? Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalize(item)])) : input;
  return JSON.stringify(normalize(value));
}

if (import.meta.hot) import.meta.hot.dispose(() => {
  channel?.close();
  void opening?.then(db => db?.close());
});

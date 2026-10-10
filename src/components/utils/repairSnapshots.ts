// Separate database: repair comparisons never overwrite normal Diff drafts or archives.
const DB_NAME = 'json-tool-repair-comparisons';
const STORE = 'snapshots';
const TTL = 24 * 60 * 60 * 1000;
interface Snapshot { id: string; createdAt: number; original: Blob; repaired: Blob; formatted: Blob }

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('Repair comparison storage is blocked'));
    });
}
export async function saveRepairSnapshot(original: string, repaired: string, formatted: string): Promise<string> {
    const db = await openDb();
    const id = crypto.randomUUID();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            const store = tx.objectStore(STORE);
            // Read only keys when expiring large records; never clone their bodies for GC.
            const expired = store.index('createdAt').openKeyCursor(IDBKeyRange.upperBound(Date.now() - TTL));
            expired.onsuccess = () => { const cursor = expired.result; if (cursor) { store.delete(cursor.primaryKey); cursor.continue(); } };
            store.put({ id, createdAt: Date.now(), original: new Blob([original]), repaired: new Blob([repaired]), formatted: new Blob([formatted]) } satisfies Snapshot);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error ?? new Error('Repair comparison storage failed'));
        });
        return id;
    } finally { db.close(); }
}
export async function loadRepairSnapshot(id: string, view: 'repair' | 'formatted'): Promise<{ original: string; result: string }> {
    const db = await openDb();
    try {
        const record = await new Promise<Snapshot | undefined>((resolve, reject) => {
            const req = db.transaction(STORE).objectStore(STORE).get(id);
            req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
        });
        if (!record || Date.now() - record.createdAt > TTL) throw new Error('Repair comparison has expired or was removed');
        const [original, result] = await Promise.all([record.original.text(), record[view === 'repair' ? 'repaired' : 'formatted'].text()]);
        return { original, result };
    } finally { db.close(); }
}

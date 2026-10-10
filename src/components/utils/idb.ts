// IndexedDB 原语与常量
// 对外暴露 openJsonToolDb / idbGet / idbPut / idbCount / idbDelete / idbGetAll / idbGetAllKeys，
// 以及数据库/对象仓库名、Tab 心跳记录类型等常量。
// 模块级 idbOpenPromise 单例保证整个应用只打开一次数据库连接。

export const IDB_DB_NAME = 'json-tool-db';
export const IDB_DB_VERSION = 2;
export const IDB_STORE_ARCHIVES = 'archivesByTab';
export const IDB_STORE_DIFF_DRAFTS = 'diffDraftByTab';
export const IDB_STORE_TAB_HEARTBEATS = 'tabHeartbeats';

// 大小/数量限制（被归档与 diff 草稿模块复用）
export const MAX_SINGLE_ARCHIVE_SIZE = 30 * 1024 * 1024; // 30MB（硬限制）
export const MAX_DIFF_SIDE_SIZE = 30 * 1024 * 1024; // 30MB（硬限制）
export const MAX_DIFF_TAB_COUNT = 30; // Diff 草稿最多保留 30 个标签页（tabId）

export interface TabHeartbeatRecord {
    tabId: string;
    updatedAt: number;
}

let idbOpenPromise: Promise<IDBDatabase> | null = null;

const REQUIRED_STORES = [IDB_STORE_ARCHIVES, IDB_STORE_DIFF_DRAFTS, IDB_STORE_TAB_HEARTBEATS] as const;

const hasAllRequiredStores = (db: IDBDatabase): boolean => REQUIRED_STORES.every((name) => db.objectStoreNames.contains(name));

const deleteJsonToolDb = (): Promise<void> =>
    new Promise((resolve, reject) => {
        const delReq = indexedDB.deleteDatabase(IDB_DB_NAME);
        delReq.onsuccess = () => resolve();
        delReq.onerror = () => reject(delReq.error ?? new Error('Failed to delete IndexedDB'));
        // 被其他 tab 的活跃连接阻塞时，仍然按成功处理：下一次 open 会再走一次校验逻辑
        delReq.onblocked = () => resolve();
    });

const doOpenJsonToolDb = (): Promise<IDBDatabase> =>
    new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(IDB_DB_NAME, IDB_DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(IDB_STORE_ARCHIVES)) {
                db.createObjectStore(IDB_STORE_ARCHIVES, { keyPath: 'tabId' });
            }
            if (!db.objectStoreNames.contains(IDB_STORE_DIFF_DRAFTS)) {
                db.createObjectStore(IDB_STORE_DIFF_DRAFTS, { keyPath: 'tabId' });
            }
            if (!db.objectStoreNames.contains(IDB_STORE_TAB_HEARTBEATS)) {
                db.createObjectStore(IDB_STORE_TAB_HEARTBEATS, { keyPath: 'tabId' });
            }
        };
        req.onsuccess = async () => {
            const db = req.result;
            // 异常分支：DB 存在但版本号已是当前版本，stores 缺失（如用户在 DevTools 中"清除站点数据"
            // 时连接被锁导致删除不彻底）。此时不会触发 onupgradeneeded，需要主动删库重建。
            if (!hasAllRequiredStores(db)) {
                db.close();
                try {
                    await deleteJsonToolDb();
                    const fresh = await doOpenJsonToolDb();
                    resolve(fresh);
                } catch (err) {
                    reject(err);
                }
                return;
            }
            // 当其他 tab 触发升级或删库时，主动让出连接，避免长期阻塞
            db.onversionchange = () => {
                db.close();
                idbOpenPromise = null;
            };
            // 连接被关闭（异常或浏览器回收）时重置单例，下一次调用重新打开
            db.onclose = () => {
                idbOpenPromise = null;
            };
            resolve(db);
        };
        req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
        req.onblocked = () => reject(new Error('Opening IndexedDB was blocked'));
    });

export const openJsonToolDb = (): Promise<IDBDatabase> => {
    if (typeof window === 'undefined') return Promise.reject(new Error('IndexedDB not available'));
    if (idbOpenPromise) return idbOpenPromise;
    idbOpenPromise = doOpenJsonToolDb().catch((err) => {
        // 失败时清空单例，避免后续调用永久卡在已 reject 的 promise 上
        idbOpenPromise = null;
        throw err;
    });
    return idbOpenPromise;
};

export const idbGet = async <T>(storeName: string, key: IDBValidKey): Promise<T | undefined> => {
    const db = await openJsonToolDb();
    return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB get failed'));
    });
};

export const idbPut = async (storeName: string, value: any): Promise<void> => {
    const db = await openJsonToolDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.put(value);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? new Error('IndexedDB put failed'));
    });
};

export const idbCount = async (storeName: string): Promise<number> => {
    const db = await openJsonToolDb();
    return await new Promise<number>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB count failed'));
    });
};

export const idbDelete = async (storeName: string, key: IDBValidKey): Promise<void> => {
    const db = await openJsonToolDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? new Error('IndexedDB delete failed'));
    });
};

export const idbGetAll = async <T>(storeName: string): Promise<T[]> => {
    const db = await openJsonToolDb();
    return await new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result ?? []) as T[]);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB getAll failed'));
    });
};

/** GC 只需标签页键，避免把每个存档桶和 Diff 草稿的正文克隆到主线程。 */
export const idbGetAllKeys = async (storeName: string): Promise<IDBValidKey[]> => {
    const db = await openJsonToolDb();
    return await new Promise<IDBValidKey[]>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAllKeys();
        req.onsuccess = () => resolve(req.result ?? []);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB getAllKeys failed'));
    });
};

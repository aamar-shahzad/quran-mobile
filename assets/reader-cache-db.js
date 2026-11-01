/**
 * IndexedDB cache for surah view payloads and mushaf pages (offline-friendly, survives reload).
 */
(function () {
  const DB_NAME = "quran-mobile-reader";
  const DB_VERSION = 1;
  const STORE_SURAH = "surahViews";
  const STORE_MUSHAF = "mushafPages";
  const SURAH_IDB_MAX = 160;
  const MUSHAF_IDB_MAX = 130;

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    if (typeof indexedDB === "undefined") {
      dbPromise = Promise.resolve(null);
      return dbPromise;
    }
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_SURAH)) {
          const store = db.createObjectStore(STORE_SURAH, { keyPath: "id" });
          store.createIndex("byUpdated", "updatedAt");
        }
        if (!db.objectStoreNames.contains(STORE_MUSHAF)) {
          const store = db.createObjectStore(STORE_MUSHAF, { keyPath: "id" });
          store.createIndex("byUpdated", "updatedAt");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch(() => null);
    return dbPromise;
  }

  function tx(storeName, mode) {
    return openDb().then((db) => {
      if (!db) return null;
      return db.transaction(storeName, mode).objectStore(storeName);
    });
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function trimStore(storeName, maxEntries) {
    const store = await tx(storeName, "readwrite");
    if (!store) return;
    const count = await reqToPromise(store.count());
    if (count <= maxEntries) return;
    const excess = count - maxEntries;
    const index = store.index("byUpdated");
    const toDelete = [];
    await new Promise((resolve, reject) => {
      const cursorReq = index.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || toDelete.length >= excess) {
          resolve();
          return;
        }
        toDelete.push(cursor.primaryKey);
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
    for (const id of toDelete) {
      store.delete(id);
    }
  }

  async function getSurahView(id) {
    const store = await tx(STORE_SURAH, "readonly");
    if (!store) return null;
    const row = await reqToPromise(store.get(id));
    return row?.payload ?? null;
  }

  async function putSurahView(id, payload) {
    const store = await tx(STORE_SURAH, "readwrite");
    if (!store) return;
    await reqToPromise(
      store.put({
        id,
        payload,
        updatedAt: Date.now(),
      }),
    );
    await trimStore(STORE_SURAH, SURAH_IDB_MAX);
  }

  async function getMushafPage(id) {
    const store = await tx(STORE_MUSHAF, "readonly");
    if (!store) return null;
    const row = await reqToPromise(store.get(id));
    return row?.verses ?? null;
  }

  async function putMushafPage(id, verses) {
    const store = await tx(STORE_MUSHAF, "readwrite");
    if (!store) return;
    await reqToPromise(
      store.put({
        id,
        verses,
        updatedAt: Date.now(),
      }),
    );
    await trimStore(STORE_MUSHAF, MUSHAF_IDB_MAX);
  }

  async function warmSurahKeys(ids) {
    const store = await tx(STORE_SURAH, "readonly");
    if (!store || !ids?.length) return [];
    const out = [];
    for (const id of ids) {
      try {
        const row = await reqToPromise(store.get(id));
        if (row?.payload) out.push({ id, payload: row.payload });
      } catch {
        /* skip */
      }
    }
    return out;
  }

  window.QuranReaderCacheDb = {
    open: openDb,
    getSurahView,
    putSurahView,
    getMushafPage,
    putMushafPage,
    warmSurahKeys,
    mushafPageId: (layoutId, pageNum) => `${layoutId}:${pageNum}`,
  };
})();

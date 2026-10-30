/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Strop cache parsovaných modelov z AIM (AIM #308). Každá revízia modelu je v IndexedDB
 * nová položka (iný obsah = iný kľúč) a viewer uvoľňuje miesto až pri plnej kvóte, takže
 * by sa revízie ASR hromadili po stovkách MB. Po autoloade preto pre každý model ostane
 * položka aktuálnej revízie (rovnaká veľkosť súboru) a jedna najnovšia iná revízia
 * (porovnanie revízií, D-089); staršie revízie rovnakého mena sa zmažú.
 *
 * Databázu otvára priamo (meno a store ako services/ifc-cache.ts; test to overuje proti
 * nemu), aby lenivý modul neťahal do vstupného balíka nič navyše.
 */

const DB_NAME = 'ifc-lite-cache';
const STORE_NAME = 'models';

export interface PruneTarget {
  fileName: string;
  fileSize: number;
}

interface EntryHead {
  key: IDBValidKey;
  fileSize: number;
  createdAt: number;
}

/**
 * Kľúče na zmazanie: položky iných revízií (iná veľkosť) okrem najnovšej inej revízie.
 * Revízia môže mať viac položiek (iné nastavenia tesselácie); ostávajú všetky jej.
 */
export function staleRevisionKeys(entries: EntryHead[], currentSize: number, keepOther = 1): IDBValidKey[] {
  const others = entries.filter((e) => e.fileSize !== currentSize).sort((a, b) => b.createdAt - a.createdAt);
  const kept = new Set<number>();
  for (const e of others) if (kept.size < keepOther) kept.add(e.fileSize);
  return others.filter((e) => !kept.has(e.fileSize)).map((e) => e.key);
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Veľkosť zdroja z kľúča cache (`ifc-<bytes>-<odtlačok>-...`, geometryCacheKey.ts). */
export function keyFileSize(key: IDBValidKey): number | null {
  const m = typeof key === 'string' ? /^ifc-(\d+)-/.exec(key) : null;
  return m ? Number(m[1]) : null;
}

/**
 * Zmaže staré revízie `targets`; chyba sa len zapíše, cache je výhoda, nie podmienka.
 * Číta len kľúče (indexy `fileName` a `createdAt`), nie položky: tie nesú zdroj modelu.
 */
export async function pruneModelCache(targets: PruneTarget[], idb: IDBFactory = indexedDB): Promise<number> {
  let removed = 0;
  let db: IDBDatabase | null = null;
  try {
    db = await request(idb.open(DB_NAME));
    if (!db.objectStoreNames.contains(STORE_NAME)) return 0;
    for (const target of targets) {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const keys = new Set(await request(store.index('fileName').getAllKeys(target.fileName)));
      const entries: EntryHead[] = [];
      await new Promise<void>((resolve, reject) => {
        const cursor = store.index('createdAt').openKeyCursor();
        cursor.onerror = () => reject(cursor.error);
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (!c) { resolve(); return; }
          const size = keyFileSize(c.primaryKey);
          if (keys.has(c.primaryKey) && size !== null) entries.push({ key: c.primaryKey, fileSize: size, createdAt: Number(c.key) });
          c.continue();
        };
      });
      const stale = staleRevisionKeys(entries, target.fileSize);
      for (const key of stale) store.delete(key);
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
      removed += stale.length;
    }
  } catch (err) {
    console.warn('[AIM cache] pruning old revisions failed', err);
  } finally {
    db?.close();
  }
  return removed;
}

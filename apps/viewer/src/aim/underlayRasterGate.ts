/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Jedna rasterizácia PDF podkladu naraz (AIMviewer #376). `useDrawingUnderlay` predtým každým
 * behom synchronizácie (každá zmena rezu, aj každý krok ťahania) zneplatnil všetky rozbehnuté
 * rasterizácie jedným globálnym tokenom a spustil ich znova: pri ťahaní rezu bežali desiatky
 * rasterov 4096 px naraz, žiadny nedobehol včas a zlyhaný (pamäť plátna) sa už neopakoval, takže
 * podklad zmizol a niekedy sa nevrátil. Brána drží pre každý podklad kľúč textúry, ktorý sa práve
 * rasterizuje: rovnaký kľúč sa nespúšťa druhýkrát, výsledok platí, kým ho nenahradil novší kľúč
 * alebo zrušenie, a zlyhanie slot uvoľní, takže ďalšia synchronizácia skúsi znova.
 */

export class UnderlayRasterGate {
  /** id podkladu -> kľúč textúry rozbehnutej rasterizácie. */
  private readonly pending = new Map<string, string>();

  /** true = spusti rasterizáciu `key`; false = presne tá už beží. */
  begin(id: string, key: string): boolean {
    if (this.pending.get(id) === key) return false;
    this.pending.set(id, key);
    return true;
  }

  /** Rasterizácia `key` dobehla: true = je stále želaná (slot sa uvoľní), false = zahodiť. */
  settle(id: string, key: string): boolean {
    if (this.pending.get(id) !== key) return false;
    this.pending.delete(id);
    return true;
  }

  /** Rasterizácia `key` zlyhala: slot sa uvoľní, ak ho medzitým nezabrala novšia. */
  fail(id: string, key: string): void {
    if (this.pending.get(id) === key) this.pending.delete(id);
  }

  /** Zahodí všetko rozbehnuté (zánik pipeline, odpojenie hooku). */
  clear(): void {
    this.pending.clear();
  }
}

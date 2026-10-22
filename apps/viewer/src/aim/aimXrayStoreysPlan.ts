/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Kontext X-ray len pre zvolené podlažia (AIM D-140, #187): čistá logika bez store.
 * Podlažia sa porovnávajú podľa normalizovaného štítku (1NP = 1.NP = 1 NP, prípona
 * `_VZT` sa zahodí), rovnako ako v AIMvieweri, aby ASR aj VZT podlažie rovnakého
 * poschodia patrili k sebe. Napojenie na store je v `aimXrayStoreys.ts`.
 */

/** Štítok podlažia: `1.NP_VZT` -> `1NP` (zhoda s `normalizeStoreyLabel` hosta). */
export function storeyLabel(raw: string): string {
  return raw.toUpperCase().split('_')[0].replace(/[\s.]/g, '');
}

/** Podlažie jedného modelu: meno a prvky, ktoré mu patria (lokálne expressId, aj cez miestnosť). */
export interface StoreyBucket {
  name: string;
  members: readonly number[];
}

/** Model federácie: jeho podlažia a preklad lokálneho id na globálne id renderera. */
export interface StoreyModel {
  buckets: readonly StoreyBucket[];
  toGlobal: (expressId: number) => number;
}

/** Zjednotenie štítkov (`add` rozšíri doterajší kontext, nezúži ho). */
export function mergeLabels(prev: readonly string[] | undefined, next: readonly string[]): string[] {
  return [...new Set([...(prev ?? []), ...next].map(storeyLabel).filter(Boolean))];
}

/**
 * Globálne id prvkov podlaží, ktoré v kontexte NIE sú; `keep` (plné prvky X-ray) a prvky bez
 * podlažia sa nedotknú. Prvok vo viacerých podlažiach (zostava) zostane, ak patrí aspoň do jedného z kontextu.
 */
export function idsOutsideStoreys(models: readonly StoreyModel[], wanted: readonly string[], keep: ReadonlySet<number>): number[] {
  const want = new Set(wanted.map(storeyLabel));
  const inside = new Set<number>();
  const outside = new Set<number>();
  for (const model of models) {
    for (const bucket of model.buckets) {
      const target = want.has(storeyLabel(bucket.name)) ? inside : outside;
      for (const id of bucket.members) target.add(model.toGlobal(id));
    }
  }
  return [...outside].filter((id) => !inside.has(id) && !keep.has(id));
}

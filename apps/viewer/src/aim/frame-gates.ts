/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Ktoré skryté triedy treba zapnúť, aby FOCUS / SELECT mal čo zarámovať
 * (AIM D-102). Čistá funkcia bez store - test ju beží bez načítania viewera.
 */

type Gate = { spaces: boolean; spatialZones: boolean };
type GateKey = keyof Gate;

const CLASS_GATE: Record<string, GateKey> = { IFCSPACE: 'spaces', IFCSPATIALZONE: 'spatialZones' };

/** Prepínače viditeľnosti, ktoré treba zapnúť, aby boli cieľové triedy v scéne. */
export function gatesToReveal(ifcTypes: readonly string[], gate: Gate): GateKey[] {
  const keys = new Set<GateKey>();
  for (const t of ifcTypes) {
    const key = CLASS_GATE[t.toUpperCase()];
    if (key && !gate[key]) keys.add(key);
  }
  return [...keys];
}


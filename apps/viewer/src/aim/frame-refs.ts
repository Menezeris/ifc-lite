/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Priblíženie kamery na prvky z FOCUS / SELECT (AIM D-102). Miestnosť
 * (IfcSpace) a zóna sú predvolene skryté, takže `flyTo` nemalo čo zarámovať
 * a kamera ostala stáť, kým agent tvrdil opak. Skrytú triedu cieľa preto
 * najprv zapne (ako hľadanie a strom viewera), počká, kým má cieľ v scéne
 * geometriu, a až potom priblíži; bez geometrie zapíše problém pre `APPLIED`.
 */

import type { BimContext, EntityRef } from '@ifc-lite/sdk';
import { useViewerStore } from '../store/index.js';
import { toGlobalIdFromModels } from '../store/globalId.js';
import { resolvePresentationIds } from '@/lib/presentation/resolvePresentationIds';

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

/** Čaká na geometriu cieľa po zapnutí triedy (scéna sa prekreslí až v ďalších snímkach). */
const WAIT_MS = 1500;
const POLL_MS = 50;
/** Animácia priblíženia (`frameBounds` 300 ms) + snímka: `APPLIED` tak nesie konečnú polohu kamery. */
const FLY_MS = 350;

function renderableIds(refs: readonly EntityRef[]): number[] {
  const state = useViewerStore.getState();
  const picked = refs.map((r) => toGlobalIdFromModels(state.models, r.modelId, r.expressId));
  const resolve = state.cameraCallbacks?.resolveHighlightIds;
  return resolve ? resolvePresentationIds(resolve, picked) : picked;
}

export async function frameRefs(
  bim: BimContext,
  refs: readonly EntityRef[],
  label: string,
  noteIssue: (text: string) => void,
  sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
): Promise<void> {
  const state = useViewerStore.getState();
  const types = refs.map((r) => state.models.get(r.modelId)?.ifcDataStore?.entities?.getTypeName?.(r.expressId) ?? '');
  for (const key of gatesToReveal(types, state.typeVisibility)) state.toggleTypeVisibility(key);
  // Bez prepínača ide priblíženie hneď; po zapnutí triedy až keď má cieľ v scéne geometriu.
  const resolvable = Boolean(state.cameraCallbacks?.resolveHighlightIds);
  for (let waited = 0; resolvable && renderableIds(refs).length === 0; waited += POLL_MS) {
    if (waited >= WAIT_MS) {
      noteIssue(`${label}: kamera sa nepohla, prvok nemá vo vieweri viditeľnú geometriu`);
      return;
    }
    await sleep(POLL_MS);
  }
  bim.viewer.flyTo([...refs]);
  await sleep(FLY_MS);
}

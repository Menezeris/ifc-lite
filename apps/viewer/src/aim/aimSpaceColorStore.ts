/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Predikát priestorov z geometrie načítaných modelov (AIM D-173); lepidlo k `aimSpaceColor.ts`. */

import { useViewerStore } from '../store/index.js';
import { spacePredicate } from './aimSpaceColor.js';

type Meshes = readonly { expressId: number; ifcType?: string }[];

export function currentSpacePredicate(): (id: number) => boolean {
  const state = useViewerStore.getState();
  const parts: Meshes[] = [];
  for (const model of state.models.values()) if (model.geometryResult?.meshes) parts.push(model.geometryResult.meshes);
  if (state.models.size === 0 && state.geometryResult?.meshes) parts.push(state.geometryResult.meshes);
  return spacePredicate(parts.flat());
}

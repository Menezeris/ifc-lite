/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Časť mosta AIM, ktorú potrebujú moduly vo vstupnom balíku (aimPanelStore, strom,
 * derivations-protocol): bez ďalších importov, aby kvôli nim nebol v eager balíku
 * celý bridge-protocol.ts (ten ich znova exportuje).
 */

import type { EntityRef } from '../store/index.js';
import type { GuidResolvableModel } from './bridge-protocol.js';

export const SOURCE = 'aim-bridge' as const;

/** GlobalId for a given EntityRef, or undefined if the model/entity is gone. */
export function guidForEntity(
  models: ReadonlyMap<string, GuidResolvableModel>,
  ref: EntityRef,
): string | undefined {
  const model = models.get(ref.modelId);
  return model?.ifcDataStore?.entities.getGlobalId(ref.expressId) || undefined;
}

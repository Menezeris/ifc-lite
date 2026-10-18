/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Pure helpers of the AIM derivations layer (D-089 phase B): model revision
 * pairing, the local eye filters over derived relations and the relative
 * "last run" time. Framework-free so they unit-test without React or stores;
 * the store (aimDerivationsStore.ts) and the components only wire them up.
 */

import type { DerivedRelationWire, ModelRevisionWire } from './bridge-protocol.js';

/**
 * Model key as the host stores it in `model_revisions`: the file name without
 * its directory and extension (`.../ifc/ASR.ifc` -> `ASR`). The viewer names an
 * autoloaded model after the last URL path segment, so both sides meet here.
 */
export function modelKey(name: string): string {
  const file = name.split(/[\\/]/).pop() ?? '';
  return file.replace(/\.[^.]+$/, '').trim();
}

/**
 * Revision of a loaded model, or null when the host sent none for it. Exact
 * key match (case-insensitive), never a substring: a wrong revision next to a
 * model is worse than none, so any mismatch shows nothing.
 */
export function revisionForModel(revisions: readonly ModelRevisionWire[], modelName: string): number | null {
  const key = modelKey(modelName).toLowerCase();
  if (!key) return null;
  const hit = revisions.find((r) => r.model.trim().toLowerCase() === key);
  return hit ? hit.revision : null;
}

/** The local eye toggles: global (all AIM relations) and per rule. */
export interface DerivedRelationsVisibility {
  relationsVisible: boolean;
  hiddenRuleIds: readonly string[];
}

/** Derived relations left after the eye toggles; none while the global eye is off. */
export function visibleDerivedRelations(
  relations: readonly DerivedRelationWire[],
  { relationsVisible, hiddenRuleIds }: DerivedRelationsVisibility,
): DerivedRelationWire[] {
  if (!relationsVisible) return [];
  if (hiddenRuleIds.length === 0) return [...relations];
  const hidden = new Set(hiddenRuleIds);
  return relations.filter((r) => !hidden.has(r.ruleId));
}

/**
 * `layer.manageUrl` when it is an absolute http(s) URL, else null. The link is
 * opened in a new tab, so a `javascript:` or relative value from a broken
 * host payload must never reach `window.open`.
 */
export function safeManageUrl(manageUrl: string | undefined): string | null {
  if (!manageUrl) return null;
  try {
    const url = new URL(manageUrl);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

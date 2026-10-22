/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Ukázať v 3D" pri dokumente s podlažím (AIM D-145): pure choice of what the
 * click does. A document bound to a storey (`storeyGuid` from DOCUMENTS_LOAD,
 * D-072) isolates that storey (Solo, the viewer's own level-display mode) and
 * opens the Section tool (Add a plane: Down, Front, Side, Face) instead of the
 * host's X-ray lens; any other document keeps the DOCUMENT_SHOW_3D lens (D-104).
 * The store / tool calls are in AimDocumentShow3d.tsx.
 */

export interface SoloStorey {
  guid: string;
  modelId: string;
  expressId: number;
}

export interface SoloRef {
  modelId: string;
  expressId: number;
}

/**
 * Storey refs to solo for a document bound to `storeyGuid`: one per federated
 * model that has the storey (a unified storey has a ref per model, as in
 * `applyLevelDisplayMode`). `null` = the document has no loaded storey, so the
 * caller falls back to the host's X-ray lens.
 */
export function soloRefs(storeyGuid: string | null | undefined, storeys: readonly SoloStorey[]): SoloRef[] | null {
  if (!storeyGuid) return null;
  const refs = storeys
    .filter((s) => s.guid === storeyGuid)
    .map(({ modelId, expressId }) => ({ modelId, expressId }));
  return refs.length > 0 ? refs : null;
}

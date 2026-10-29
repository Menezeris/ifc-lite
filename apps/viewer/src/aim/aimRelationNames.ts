/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Provider hooks for the `spatial` column levels `Referenced` and `Boundary` (AIM #277): the names
 * of the entities on the relating side of `IfcRelReferencedInSpatialStructure` and
 * `IfcRelSpaceBoundary`, read from the INVERSE edges of the element.
 */

import { RelationshipType } from '@ifc-lite/data';
import type { IfcDataStore } from '@ifc-lite/parser';
import type { ListDataProvider } from '@ifc-lite/lists';

export function relationNameHooks(store: IfcDataStore): Pick<ListDataProvider, 'getReferencedInNames' | 'getSpaceBoundaryNames'> {
  /** Unnamed entities are named by their IFC class. */
  const names = (entityId: number, relType: RelationshipType): string[] =>
    (store.relationships?.getRelated(entityId, relType, 'inverse') ?? [])
      .map((id) => store.entities.getName(id) || store.entities.getTypeName(id) || '')
      .filter(Boolean);
  return {
    getReferencedInNames: (entityId) => names(entityId, RelationshipType.ReferencedInSpatialStructure),
    getSpaceBoundaryNames: (entityId) => names(entityId, RelationshipType.SpaceBoundary),
  };
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `spatial` column levels for IFC relations beyond the containment tree (AIM #277):
 * `Referenced` (IfcRelReferencedInSpatialStructure), `Boundary` (IfcRelSpaceBoundary)
 * and `Aggregate` (IfcRelAggregates parents). Several related entities are joined with ", ".
 */

import type { ListDataProvider } from './types.js';
import type { CellValue } from './result-types.js';

/** Non-empty names joined with ", " (declaration order); null when none. Distinct entities with the same name stay separate (dedup is by id, upstream). */
function joinNames(names: readonly string[] | undefined): CellValue {
  const out = (names ?? []).filter(Boolean);
  return out.length > 0 ? out.join(', ') : null;
}

/** Value of the relation level, or `undefined` when `level` is not one (the caller resolves the classic levels). */
export function relationLevelValue(level: string, entityId: number, provider: ListDataProvider): CellValue | undefined {
  switch (level.toLowerCase()) {
    case 'referenced': return joinNames(provider.getReferencedInNames?.(entityId));
    case 'boundary': return joinNames(provider.getSpaceBoundaryNames?.(entityId));
    // Distinct parents by id; an unnamed parent is named by its IFC class, like Referenced and Boundary.
    case 'aggregate': return joinNames([...new Set(provider.getAggregateParents?.(entityId) ?? [])].map((id) => provider.getEntityName(id) || provider.getEntityTypeName(id)));
    default: return undefined;
  }
}

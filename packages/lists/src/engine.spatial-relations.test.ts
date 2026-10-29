/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `spatial` column levels for IFC relations beyond the containment tree (AIM #277):
 * `Referenced` (IfcRelReferencedInSpatialStructure), `Boundary` (IfcRelSpaceBoundary)
 * and `Aggregate` (IfcRelAggregates parents).
 */

import { describe, it, expect } from 'vitest';
import { IfcTypeEnum } from '@ifc-lite/data';
import { executeList } from './engine.js';
import type { ListDataProvider, ListDefinition } from './types.js';

const NAMES: Record<number, string> = { 1: 'Dvere D1', 2: 'Stena S1', 3: 'Izba A', 4: 'Izba B', 5: 'Zostava Z' };

function provider(): ListDataProvider {
  return {
    getEntitiesByType: (t) => (t === IfcTypeEnum.IfcWall ? [1, 2] : []),
    getEntityName: (id) => NAMES[id] ?? `E${id}`,
    getEntityGlobalId: (id) => `guid-${id}`,
    getEntityDescription: () => '',
    getEntityObjectType: () => '',
    getEntityTag: () => '',
    getEntityTypeName: () => 'IfcWall',
    getPropertySets: () => [],
    getQuantitySets: () => [],
    getReferencedInNames: (id) => (id === 1 ? ['Izba A', 'Izba A'] : []),
    getSpaceBoundaryNames: (id) => (id === 1 ? ['Izba A', 'Izba B'] : []),
    getAggregateParents: (id) => (id === 2 ? [5] : []),
  };
}

const list = (propertyName: string): ListDefinition => ({
  id: 't', name: 'T', createdAt: 0, updatedAt: 0, entityTypes: [IfcTypeEnum.IfcWall], groups: [],
  columns: [{ id: 'c', source: 'spatial', propertyName }],
});
const cells = (level: string) => {
  const r = executeList(list(level), provider());
  return [1, 2].map((id) => r.rows.find((row) => row.entityId === id)!.values[0]);
};

describe('spatial column: IFC relation levels (#277)', () => {
  it('Referenced: spaces referencing the element, distinct, joined', () => {
    expect(cells('Referenced')).toEqual(['Izba A', null]);
    expect(cells('referenced')).toEqual(['Izba A', null]);
  });
  it('Boundary: every space the element bounds', () => {
    expect(cells('Boundary')).toEqual(['Izba A, Izba B', null]);
  });
  it('Aggregate: names of the aggregate parents', () => {
    expect(cells('Aggregate')).toEqual([null, 'Zostava Z']);
  });
  it('a provider without the hooks yields empty cells, not the storey', () => {
    const bare = { ...provider(), getReferencedInNames: undefined, getSpaceBoundaryNames: undefined, getStoreyName: () => 'NP1' };
    const r = executeList(list('Boundary'), bare);
    expect(r.rows.map((row) => row.values[0])).toEqual([null, null]);
  });
});

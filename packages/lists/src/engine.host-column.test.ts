/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `host` column (AIM D-174, #277): values the AIM host sends by GlobalId reach the cell through the
 * provider hook `getHostValue`.
 */

import { describe, it, expect } from 'vitest';
import { IfcTypeEnum } from '@ifc-lite/data';
import { executeList } from './engine.js';
import type { ListDataProvider, ListDefinition } from './types.js';

const VALUES: Record<string, string> = { 'guid-1': 'Izba A', 'guid-2': '' };

function provider(withHook = true): ListDataProvider {
  return {
    getEntitiesByType: (t) => (t === IfcTypeEnum.IfcWall ? [1, 2, 3] : []),
    getEntityName: (id) => `E${id}`,
    getEntityGlobalId: (id) => `guid-${id}`,
    getEntityDescription: () => '',
    getEntityObjectType: () => '',
    getEntityTag: () => '',
    getEntityTypeName: () => 'IfcWall',
    getPropertySets: () => [],
    getQuantitySets: () => [],
    ...(withHook ? { getHostValue: (id: number, key: string) => (key === 'space_derived' ? VALUES[`guid-${id}`] : undefined) } : {}),
  };
}

const list = (propertyName: string): ListDefinition => ({
  id: 't', name: 'T', createdAt: 0, updatedAt: 0, entityTypes: [IfcTypeEnum.IfcWall], groups: [],
  columns: [{ id: 'c', source: 'host', propertyName }],
});
const cells = (key: string, p = provider()) => {
  const r = executeList(list(key), p);
  return [1, 2, 3].map((id) => r.rows.find((row) => row.entityId === id)!.values[0]);
};

describe('host column (D-174)', () => {
  it('cell = the hook value by key; missing value = empty cell', () => {
    expect(cells('space_derived')).toEqual(['Izba A', '', null]);
  });
  it('an unknown key or a provider without the hook yields empty cells', () => {
    expect(cells('other')).toEqual([null, null, null]);
    expect(cells('space_derived', provider(false))).toEqual([null, null, null]);
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AIM #277: the provider hooks behind the `spatial` columns `Referenced` (IfcRelReferencedInSpatialStructure)
 * and `Boundary` (IfcRelSpaceBoundary), on a store from the real parser (no WASM needed): the relating
 * space is read from the INVERSE edge of the element, then the column resolves through `executeList`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IfcTypeEnum } from '@ifc-lite/data';
import { IfcParser } from '@ifc-lite/parser';
import { executeList, type ListDefinition } from '@ifc-lite/lists';
import { relationNameHooks } from './aimRelationNames.js';

const IFC = `ISO-10303-21;
HEADER;FILE_DESCRIPTION((''),'2;1');FILE_NAME('a','',(''),(''),'','','');FILE_SCHEMA(('IFC4'));ENDSEC;
DATA;
#1=IFCPROJECT('0000000000000000000001',$,'P',$,$,$,$,$,$);
#2=IFCBUILDING('0000000000000000000002',$,'B',$,$,$,$,$,.ELEMENT.,$,$,$);
#3=IFCBUILDINGSTOREY('0000000000000000000003',$,'S1',$,$,$,$,$,.ELEMENT.,0.);
#4=IFCSPACE('0000000000000000000004',$,'Room A',$,$,$,$,$,.ELEMENT.,.INTERNAL.,$);
#5=IFCWALL('0000000000000000000005',$,'W1',$,$,$,$,$,$);
#6=IFCWALL('0000000000000000000006',$,'W2',$,$,$,$,$,$);
#7=IFCRELAGGREGATES('0000000000000000000007',$,$,$,#1,(#2));
#8=IFCRELAGGREGATES('0000000000000000000008',$,$,$,#2,(#3));
#9=IFCRELCONTAINEDINSPATIALSTRUCTURE('0000000000000000000009',$,$,$,(#5),#3);
#10=IFCRELREFERENCEDINSPATIALSTRUCTURE('000000000000000000000A',$,$,$,(#6),#4);
#11=IFCRELSPACEBOUNDARY('000000000000000000000B',$,$,$,#4,#5,$,.PHYSICAL.,.INTERNAL.);
ENDDATA;
END-ISO-10303-21;`;

const list = (level: string): ListDefinition => ({
  id: 'l', name: 'L', createdAt: 0, updatedAt: 0, entityTypes: [IfcTypeEnum.IfcWall], groups: [],
  columns: [{ id: 'n', source: 'attribute', propertyName: 'Name' }, { id: 's', source: 'spatial', propertyName: level }],
});

describe('spatial relation columns on a parsed IFC (#277)', () => {
  it('Referenced and Boundary come from the inverse edges, other elements stay empty', async () => {
    const store = await new IfcParser().parseColumnar(new TextEncoder().encode(IFC).buffer as ArrayBuffer, { disableWorkerScan: true });
    const hooks = relationNameHooks(store);
    assert.deepEqual([hooks.getReferencedInNames!(6), hooks.getSpaceBoundaryNames!(5), hooks.getSpaceBoundaryNames!(6)], [['Room A'], ['Room A'], []]);
    const provider = {
      getEntitiesByType: (t: IfcTypeEnum) => (t === IfcTypeEnum.IfcWall ? [5, 6] : []),
      getEntityName: (id: number) => store.entities.getName(id),
      getEntityGlobalId: () => '', getEntityDescription: () => '', getEntityObjectType: () => '', getEntityTag: () => '',
      getEntityTypeName: () => 'IfcWall', getPropertySets: () => [], getQuantitySets: () => [], ...hooks,
    };
    const col = (level: string) => Object.fromEntries(executeList(list(level), provider as never).rows.map((r) => [r.values[0], r.values[1]]));
    assert.deepEqual(col('Referenced'), { W1: null, W2: 'Room A' });
    assert.deepEqual(col('Boundary'), { W1: 'Room A', W2: null });
  });

  it('dva priestory s rovnakým názvom sa v stĺpci ukážu oba', async () => {
    const twin = IFC.replace('ENDDATA;', `#12=IFCSPACE('000000000000000000000C',$,'Room A',$,$,$,$,$,.ELEMENT.,.INTERNAL.,$);
#13=IFCRELSPACEBOUNDARY('000000000000000000000D',$,$,$,#12,#5,$,.PHYSICAL.,.INTERNAL.);
ENDDATA;`);
    const store = await new IfcParser().parseColumnar(new TextEncoder().encode(twin).buffer as ArrayBuffer, { disableWorkerScan: true });
    const provider = {
      getEntitiesByType: (t: IfcTypeEnum) => (t === IfcTypeEnum.IfcWall ? [5] : []),
      getEntityName: (id: number) => store.entities.getName(id),
      getEntityGlobalId: () => '', getEntityDescription: () => '', getEntityObjectType: () => '', getEntityTag: () => '',
      getEntityTypeName: () => 'IfcWall', getPropertySets: () => [], getQuantitySets: () => [], ...relationNameHooks(store),
    };
    const cell = executeList(list('Boundary'), provider as never).rows[0].values[1];
    assert.equal(cell, 'Room A, Room A', 'dva rôzne priestory, nie jeden');
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { isLensEnvelope, type LensInboundMessage } from './lens-protocol.js';
import { listDefinitionFromChat, parseOpenList, type OpenListMessage } from './aimListPlan.js';

const S = 'aim-bridge' as const;
const DOORS = { combinator: 'AND', rules: [{ kind: 'ifcType', op: 'in', values: ['IfcDoor'] }] };
const ON_ASR = { combinator: 'AND', rules: [{ kind: 'model', op: 'in', values: ['ASR'] }] };
const MODELS = [
  { name: 'DIPLOMKA_ASR.ifc', fingerprint: 'fp-asr' },
  { name: 'DIPLOMKA_VZT.ifc', fingerprint: 'fp-vzt' },
];
const msg = (extra: Partial<OpenListMessage> = {}): LensInboundMessage =>
  ({
    source: S,
    type: 'OPEN_LIST',
    name: 'Dvere 1NP',
    groups: [DOORS],
    columns: [
      { source: 'attribute', propertyName: 'Name' },
      { source: 'property', psetName: 'Pset_DoorCommon', propertyName: 'FireRating', label: 'Požiarna odolnosť' },
      { source: 'spatial', propertyName: 'Storey' },
    ],
    ...extra,
  }) as LensInboundMessage;

describe('zoznam z chatu (AIM D-111)', () => {
  it('obálka OPEN_LIST ide cez most Lens', () => {
    assert.equal(isLensEnvelope(msg()), true);
  });

  it('prijme filtre a stĺpce a zostaví ListDefinition pre builder', () => {
    const parsed = parseOpenList(msg({ groups: [DOORS, ON_ASR] }));
    assert.ok(parsed);
    const def = listDefinitionFromChat(parsed, MODELS, 'list-1', 1000);
    assert.equal(def.id, 'list-1');
    assert.equal(def.name, 'Dvere 1NP');
    assert.deepEqual(def.entityTypes, []);
    assert.deepEqual(def.groups[1].rules[0], { kind: 'model', op: 'in', values: ['fp-asr'] });
    assert.deepEqual(def.columns.map((c) => [c.id, c.source, c.psetName ?? null, c.propertyName, c.label ?? null]), [
      ['col-0', 'attribute', null, 'Name', null],
      ['col-1', 'property', 'Pset_DoorCommon', 'FireRating', 'Požiarna odolnosť'],
      ['col-2', 'spatial', null, 'Storey', null],
    ]);
  });

  it('odmietne neznámy zdroj stĺpca, pset bez sady, prázdne stĺpce a zlý filter', () => {
    assert.equal(parseOpenList(msg({ columns: [{ source: 'sql' as never, propertyName: 'x' }] })), null);
    assert.equal(parseOpenList(msg({ columns: [{ source: 'property', propertyName: 'FireRating' }] })), null);
    assert.equal(parseOpenList(msg({ columns: [] })), null);
    assert.equal(parseOpenList(msg({ groups: [{ combinator: 'XOR', rules: [] }] })), null);
    assert.equal(parseOpenList(msg({ name: '' })), null);
  });
});

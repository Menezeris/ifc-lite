/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import type { LensInboundMessage } from './lens-protocol.js';
import { MAX_AIM_GLOBAL_IDS, legendPanelRect, nextAimLens, parseLensMessage } from './aimLensPlan.js';

const S = 'aim-bridge' as const;
const WALLS = { combinator: 'AND', rules: [{ kind: 'ifcType', op: 'in', values: ['IfcWall'] }, { kind: 'storey', op: 'in', values: ['1NP'] }] };
const apply = (m: Record<string, unknown>) => ({ source: S, type: 'APPLY_LENS', ...m }) as unknown as LensInboundMessage;

describe('Lens z chatu: rozsah farieb podľa hodnoty a legenda (AIM D-119)', () => {
  it('autoColor s rozsahom (filter volania) prejde, rozsah bez autoColor nie', () => {
    assert.ok(parseLensMessage(apply({ mode: 'replace', autoColor: { source: 'material' }, autoColorScope: [WALLS] })));
    assert.equal(parseLensMessage(apply({ mode: 'replace', rules: [{ name: 'x', action: 'colorize', color: '#ff0000', groups: [WALLS] }], autoColorScope: [WALLS] })), null);
  });

  it('neplatný rozsah sa odmietne: prázdny, priveľa skupín, nie FilterGroup, priveľa GUID', () => {
    const ac = { source: 'material' };
    assert.equal(parseLensMessage(apply({ mode: 'replace', autoColor: ac, autoColorScope: [] })), null);
    assert.equal(parseLensMessage(apply({ mode: 'replace', autoColor: ac, autoColorScope: Array(9).fill(WALLS) })), null);
    assert.equal(parseLensMessage(apply({ mode: 'replace', autoColor: ac, autoColorScope: [{ rules: 'x' }] })), null);
    assert.equal(parseLensMessage(apply({ mode: 'replace', autoColor: ac, autoColorScope: 'IfcWall' })), null);
    const ids = Array.from({ length: MAX_AIM_GLOBAL_IDS + 1 }, (_, i) => `g${i}`);
    const many = { combinator: 'AND', rules: [{ kind: 'globalId', op: 'in', values: ids }] };
    assert.equal(parseLensMessage(apply({ mode: 'replace', autoColor: ac, autoColorScope: [many] })), null);
  });

  it('samotná legenda (add bez pravidiel) prejde a lens nezmení; neznáma veľkosť nie', () => {
    const msg = parseLensMessage(apply({ mode: 'add', legend: 'large' }));
    assert.ok(msg && msg.type === 'APPLY_LENS');
    assert.ok(parseLensMessage(apply({ mode: 'add', legend: 'normal' })));
    assert.equal(parseLensMessage(apply({ mode: 'add', legend: 'huge' })), null);
    assert.equal(parseLensMessage(apply({ mode: 'replace', legend: 'large' })), null, 'replace bez pravidiel by lens zmazal');
    assert.equal(parseLensMessage(apply({ mode: 'add' })), null);
    const own = { id: 'slot', name: 'AIM chat', rules: [{ id: 'aim-a-0', name: 'x', enabled: true, action: 'colorize' as const, color: '#ff0000', groups: [] }] };
    if (msg && msg.type === 'APPLY_LENS') assert.equal(nextAimLens(own, msg, 'slot', [], 't'), own);
  });

  it('okno veľkej legendy: takmer celý viewer, najviac 960 px, v strede', () => {
    assert.deepEqual(legendPanelRect(1400, 900), { x: 220, y: 96, w: 960, h: 740 });
    assert.deepEqual(legendPanelRect(800, 600), { x: 48, y: 96, w: 704, h: 440 });
    const small = legendPanelRect(300, 300);
    assert.equal(small.w, 320);
    assert.equal(small.h, 320);
    assert.equal(small.x, 16);
  });
});

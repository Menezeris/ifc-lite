/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { idsOutsideStoreys, mergeLabels, storeyLabel, type StoreyModel } from './aimXrayStoreysPlan.js';
import { isXrayStoreys, parseLensMessage } from './aimLensPlan.js';
import type { LensInboundMessage } from './lens-protocol.js';

const S = 'aim-bridge';
const ASR: StoreyModel = {
  buckets: [
    { name: '1NP', members: [1, 2, 3] },
    { name: '2NP', members: [4, 5] },
    { name: '3NP', members: [6] },
  ],
  toGlobal: (id) => id,
};
// VZT model: iné meno podlažia, globálne id posunuté o 1000.
const VZT: StoreyModel = {
  buckets: [
    { name: '1NP_VZT', members: [1, 2] },
    { name: '2.NP_VZT', members: [3] },
  ],
  toGlobal: (id) => id + 1000,
};

describe('X-ray kontext len pre podlažia (AIM #187)', () => {
  it('štítok podlažia zahodí prponu modelu, bodky a medzery', () => {
    assert.equal(storeyLabel('1.NP_VZT'), '1NP');
    assert.equal(storeyLabel('2 np'), '2NP');
  });

  it('skryje ostatné podlažia ASR aj VZT, kontext 1NP ostane', () => {
    const out = idsOutsideStoreys([ASR, VZT], ['1NP'], new Set());
    assert.deepEqual(out.sort((a, b) => a - b), [4, 5, 6, 1003]);
  });

  it('plné prvky X-ray (keep) sa neskryjú, aj keď sú na inom podlaží', () => {
    const out = idsOutsideStoreys([ASR], ['1NP'], new Set([4]));
    assert.deepEqual(out.sort((a, b) => a - b), [5, 6]);
  });

  it('prvok v podlaží kontextu aj mimo neho (zostava) ostane; viac podlaží v kontexte', () => {
    const shared: StoreyModel = { buckets: [{ name: '1NP', members: [1, 9] }, { name: '2NP', members: [9, 2] }], toGlobal: (id) => id };
    assert.deepEqual(idsOutsideStoreys([shared], ['1NP'], new Set()), [2]);
    assert.deepEqual(idsOutsideStoreys([ASR], ['1NP', '2.NP'], new Set()), [6]);
  });

  it('mergeLabels pri add rozšíri kontext, nezúži ho', () => {
    assert.deepEqual(mergeLabels(['1NP'], ['2.NP', '1np']), ['1NP', '2NP']);
    assert.deepEqual(mergeLabels(undefined, []), []);
  });

  it('správa APPLY_LENS: xrayStoreys len s xray a platným zoznamom', () => {
    const base = { source: S, type: 'APPLY_LENS', mode: 'replace', rules: [{ name: 'S', action: 'isolate', groups: [{ combinator: 'AND', rules: [{ kind: 'ifcType', op: 'in', values: ['IfcCovering'] }] }] }] };
    const parse = (extra: object) => parseLensMessage({ ...base, ...extra } as unknown as LensInboundMessage);
    assert.ok(parse({ xray: true, xrayStoreys: ['1NP'] }));
    assert.equal(parse({ xrayStoreys: ['1NP'] }), null, 'bez xray');
    assert.equal(parse({ isolate: true, xrayStoreys: ['1NP'] }), null, 's izoláciou');
    assert.equal(parse({ xray: true, xrayStoreys: [] }), null);
    assert.equal(parse({ xray: true, xrayStoreys: [''] }), null);
    assert.equal(parse({ xray: true, xrayStoreys: 'nope' }), null);
    assert.equal(isXrayStoreys(new Array(9).fill('1NP')), false);
  });
});

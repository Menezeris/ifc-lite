/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { soloRefs } from './show3dSoloPlan.js';

const STOREYS = [
  { guid: 'G1', modelId: 'ASR', expressId: 10 },
  { guid: 'G2', modelId: 'ASR', expressId: 20 },
  { guid: 'G1', modelId: 'VZT', expressId: 7 },
];

describe('Ukázať v 3D pri dokumente s podlažím (AIM D-145)', () => {
  it('podlažie dokumentu sa izoluje vo všetkých modeloch federácie', () => {
    assert.deepStrictEqual(soloRefs('G1', STOREYS), [
      { modelId: 'ASR', expressId: 10 },
      { modelId: 'VZT', expressId: 7 },
    ]);
    assert.deepStrictEqual(soloRefs('G2', STOREYS), [{ modelId: 'ASR', expressId: 20 }]);
  });

  it('dokument bez podlažia alebo s nenačítaným podlažím ostáva pri X-ray lens hosta', () => {
    assert.strictEqual(soloRefs(undefined, STOREYS), null);
    assert.strictEqual(soloRefs(null, STOREYS), null);
    assert.strictEqual(soloRefs('', STOREYS), null);
    assert.strictEqual(soloRefs('G9', STOREYS), null);
    assert.strictEqual(soloRefs('G1', []), null);
  });
});

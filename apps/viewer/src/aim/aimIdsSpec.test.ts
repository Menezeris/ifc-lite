/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findSpecification, onlySpecification } from './aimIdsSpec.js';

const doc = {
  info: 'x',
  specifications: [
    { id: 'spec-1', name: 'Miestnosti majú cenu', identifier: 'IU-O-space' },
    { id: 'spec-2', name: 'Steny majú požiarnu odolnosť' },
    { id: 'IU-O-space', name: 'Zámerná kolízia id' },
  ],
};

describe('beh jednej špecifikácie IDS (D-162)', () => {
  it('hľadá podľa identifikátora, potom názvu, potom id; bez ohľadu na veľkosť písmen', () => {
    assert.equal(findSpecification(doc, 'iu-o-space')?.id, 'spec-1');
    assert.equal(findSpecification(doc, ' Steny majú požiarnu odolnosť ')?.id, 'spec-2');
    assert.equal(findSpecification(doc, 'spec-2')?.id, 'spec-2');
    assert.equal(findSpecification(doc, 'nič'), undefined);
    assert.equal(findSpecification(doc, '  '), undefined);
  });

  it('dokument zúžený na jednu špecifikáciu; bez id ostáva pôvodný objekt', () => {
    const one = onlySpecification(doc, 'spec-2');
    assert.deepEqual(one.specifications.map((s) => s.id), ['spec-2']);
    assert.equal(one.info, 'x');
    assert.equal(doc.specifications.length, 3, 'pôvodný dokument sa nemení');
    assert.equal(onlySpecification(doc, undefined), doc);
  });

  it('neexistujúce id dá dokument bez špecifikácií, nie celý dokument', () => {
    assert.deepEqual(onlySpecification(doc, 'neexistuje').specifications, []);
  });
});

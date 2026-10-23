/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { describeViewChanges, sectionLabel, type ViewSnapshot } from './viewDelta.js';

const AFTER_COMMAND: ViewSnapshot = {
  isolated: 21, xray: null, hidden: 0, section: 'down 30.1 %', selection: 0, lens: 'AIM chat (2 pravidiel)',
};

describe('viewDelta (AIM D-125)', () => {
  it('bez zmeny prázdne', () => {
    assert.deepEqual(describeViewChanges(AFTER_COMMAND, { ...AFTER_COMMAND }), []);
  });

  it('izoláciu vypol používateľ (#180): povie, koľko prvkov bolo izolovaných', () => {
    assert.deepEqual(describeViewChanges(AFTER_COMMAND, { ...AFTER_COMMAND, isolated: null }), ['izolácia zrušená (bolo 21 prvkov)']);
  });

  it('každý kanál zvlášť: X-ray, skryté, rez, výber, lens', () => {
    const now: ViewSnapshot = {
      isolated: 21, xray: 52, hidden: 3103, section: null, selection: 1, lens: null,
    };
    assert.deepEqual(describeViewChanges(AFTER_COMMAND, now), [
      'X-ray zapnutá (52 prvkov)',
      'skryté prvky 0 -> 3103',
      'rez down 30.1 % -> zrušený',
      'výber 0 -> 1 prvkov',
      'lens AIM chat (2 pravidiel) -> vypnutá',
    ]);
    assert.deepEqual(describeViewChanges({ ...AFTER_COMMAND, isolated: 5 }, AFTER_COMMAND), ['izolácia zmenená (5 -> 21 prvkov)']);
  });

  it('opis rezu: os, poloha na desatinu, otočenie', () => {
    assert.equal(sectionLabel(null), null);
    assert.equal(sectionLabel({ axis: 'down', position: 30.064 }), 'down 30.1 %');
    assert.equal(sectionLabel({ axis: 'front', position: 50, flipped: true }), 'front 50.0 % otočený');
  });
});

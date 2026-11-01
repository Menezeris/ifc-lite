/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { UnderlayRasterGate } from './underlayRasterGate.js';

describe('jedna rasterizácia PDF podkladu naraz (AIMviewer #376)', () => {
  it('rovnaká strana sa druhýkrát nespúšťa, dobehnutá uvoľní slot', () => {
    const gate = new UnderlayRasterGate();
    assert.equal(gate.begin('a', 'a|p1'), true);
    assert.equal(gate.begin('a', 'a|p1'), false);
    assert.equal(gate.begin('b', 'b|p1'), true, 'iný podklad má vlastný slot');
    assert.equal(gate.settle('a', 'a|p1'), true);
    assert.equal(gate.settle('a', 'a|p1'), false, 'druhé doručenie toho istého sa zahodí');
    assert.equal(gate.begin('a', 'a|p1'), true);
  });

  it('nahradená strana (iná strana PDF) sa po dobehnutí zahodí, novšia platí', () => {
    const gate = new UnderlayRasterGate();
    gate.begin('a', 'a|p1');
    assert.equal(gate.begin('a', 'a|p2'), true);
    assert.equal(gate.settle('a', 'a|p1'), false);
    assert.equal(gate.settle('a', 'a|p2'), true);
  });

  it('zlyhanie uvoľní len vlastný slot; clear zahodí všetko rozbehnuté', () => {
    const gate = new UnderlayRasterGate();
    gate.begin('a', 'a|p1');
    gate.begin('a', 'a|p2');
    gate.fail('a', 'a|p1');
    assert.equal(gate.begin('a', 'a|p2'), false, 'novšia rasterizácia stále beží');
    gate.fail('a', 'a|p2');
    assert.equal(gate.begin('a', 'a|p2'), true, 'po zlyhaní sa smie skúsiť znova');
    gate.clear();
    assert.equal(gate.settle('a', 'a|p2'), false);
  });
});

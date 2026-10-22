/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createBodyWidthSettler } from './docLayout.js';

describe('createBodyWidthSettler (AIM #239)', () => {
  it('passes the first and plain changing widths through, rounded down', () => {
    const s = createBodyWidthSettler();
    assert.equal(s.next(800.6), 800);
    assert.equal(s.next(640), 640);
    assert.equal(s.next(700), 700);
  });
  it('ignores sub-pixel jitter', () => {
    const s = createBodyWidthSettler();
    assert.equal(s.next(800), 800);
    assert.equal(s.next(800.4), 800);
  });
  it('stops the scrollbar oscillation A-B-A on the narrower width', () => {
    const s = createBodyWidthSettler();
    assert.equal(s.next(800), 800); // bez posuvníka
    assert.equal(s.next(785), 785); // zvislý posuvník
    assert.equal(s.next(800), 785); // posuvník zmizol -> kmitanie, ostať užšie
    assert.equal(s.next(785), 785);
    assert.equal(s.next(800), 785); // už zmrazené
  });
  it('a real pane resize after the freeze is followed again', () => {
    const s = createBodyWidthSettler();
    s.next(800); s.next(785); s.next(800); // zmrazené na 785
    assert.equal(s.next(783), 783); // pomalé ťahanie deliča po malých krokoch
    assert.equal(s.next(781), 781);
    assert.equal(s.next(500), 500);
  });
  it('a one-way resize (panel drag) is not mistaken for oscillation', () => {
    const s = createBodyWidthSettler();
    for (const w of [800, 780, 760, 740]) assert.equal(s.next(w), w);
  });
});

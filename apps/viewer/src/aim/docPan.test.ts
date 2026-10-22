/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canStartPan, movePan, PAN_THRESHOLD_PX, startPan } from './docPan.js';

/** Cieľ, ktorý patrí pod dané selektory (napr. text pdf.js alebo tlačidlo). */
const within = (...inside: string[]) => ({
  closest: (sel: string) => (inside.some((i) => sel.includes(i)) ? {} : null),
});
const mouse = (target: unknown, over: Record<string, unknown> = {}) =>
  ({ button: 0, pointerType: 'mouse', target, ...over });

describe('canStartPan (AIM #213)', () => {
  it('starts on empty page area with the left mouse button', () => {
    assert.equal(canStartPan(mouse(within())), true);
    assert.equal(canStartPan(mouse(within(), { pointerType: 'pen' })), true);
  });
  it('leaves text selection to pdf.js text spans', () => {
    assert.equal(canStartPan(mouse(within('.pdf-doc-text-layer span'))), false);
  });
  it('leaves clickable drawing labels (D-130) and controls alone', () => {
    assert.equal(canStartPan(mouse(within('[role="button"]'))), false);
    assert.equal(canStartPan(mouse(within('button'))), false);
  });
  it('ignores other buttons, touch and missing targets', () => {
    assert.equal(canStartPan(mouse(within(), { button: 1 })), false);
    assert.equal(canStartPan(mouse(within(), { button: 2 })), false);
    assert.equal(canStartPan(mouse(within(), { pointerType: 'touch' })), false);
    assert.equal(canStartPan(mouse(null)), false);
    assert.equal(canStartPan(mouse({})), false);
  });
});

describe('movePan (AIM #213)', () => {
  it('stays a click below the threshold', () => {
    const s = startPan(100, 100, 50, 80);
    assert.equal(movePan(s, 100 + PAN_THRESHOLD_PX - 1, 100), null);
    assert.equal(s.active, false);
  });
  it('scrolls opposite to the drag once past the threshold', () => {
    const s = startPan(100, 100, 50, 80);
    assert.deepEqual(movePan(s, 130, 90), { left: 20, top: 90 });
    assert.equal(s.active, true);
  });
  it('keeps panning after the pointer returns near the start', () => {
    const s = startPan(0, 0, 10, 10);
    movePan(s, 20, 0);
    assert.deepEqual(movePan(s, 1, 0), { left: 9, top: 10 });
  });
});

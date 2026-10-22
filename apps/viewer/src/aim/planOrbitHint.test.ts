/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { inLockedPlan, offerKey, orbitAttempted, startPress, ORBIT_ATTEMPT_PX } from './planOrbitHint.js';

describe('pokus o orbit v zamknutom pôdoryse (AIM #188)', () => {
  it('ťah orbitovým gestom nad prah je pokus o orbit', () => {
    const p = startPress(100, 100, 'orbit');
    assert.equal(orbitAttempted(p, 100 + ORBIT_ATTEMPT_PX + 1, 100), true);
    assert.equal(orbitAttempted(p, 100, 100 - ORBIT_ATTEMPT_PX - 1), true);
  });

  it('pravé tlačidlo ako fly sa berie ako orbit, rovnako ako v 3D', () => {
    assert.equal(orbitAttempted(startPress(0, 0, 'fly'), 20, 0), true);
  });

  it('klik a malý pohyb ponuku nespustia', () => {
    const p = startPress(100, 100, 'orbit');
    assert.equal(orbitAttempted(p, 100, 100), false);
    assert.equal(orbitAttempted(p, 100 + ORBIT_ATTEMPT_PX, 100 - ORBIT_ATTEMPT_PX), false);
    assert.equal(orbitAttempted(null, 500, 500), false);
  });

  it('posun (pan) a nástroj ponuku nikdy nespustia', () => {
    assert.equal(orbitAttempted(startPress(0, 0, 'pan'), 200, 200), false);
    assert.equal(orbitAttempted(startPress(0, 0, 'tool'), 200, 200), false);
  });

  it('ponuka len v zamknutom pôdoryse v záložke, nie v 3D ani v splite', () => {
    assert.equal(inLockedPlan({ sceneKind: 'plan', viewLocked: true, splitView: false }), true);
    assert.equal(inLockedPlan({ sceneKind: '3d', viewLocked: true, splitView: false }), false);
    assert.equal(inLockedPlan({ sceneKind: 'plan', viewLocked: false, splitView: false }), false);
    assert.equal(inLockedPlan({ sceneKind: 'plan', viewLocked: true, splitView: true }), false);
    assert.equal(inLockedPlan({ sceneKind: undefined, viewLocked: true, splitView: false }), false);
  });

  it('Enter a medzerník prijmú, Esc zavrie, fokus na ovládacom prvku kláves nechá jemu', () => {
    assert.equal(offerKey('Enter', 'BODY', false), 'accept');
    assert.equal(offerKey(' ', 'CANVAS', false), 'accept');
    assert.equal(offerKey('Escape', 'INPUT', true), 'dismiss');
    assert.equal(offerKey('Enter', 'BUTTON', false), null);
    assert.equal(offerKey(' ', 'INPUT', false), null);
    assert.equal(offerKey('Enter', 'DIV', true), null);
    assert.equal(offerKey('a', 'BODY', false), null);
  });
});

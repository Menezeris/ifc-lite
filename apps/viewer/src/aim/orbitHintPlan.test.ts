/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ORBIT_ATTEMPT_PX, ORBIT_HINT_COOLDOWN_MS, isSwitchTo3dKey, orbitBlocked, shouldShowOrbitHint, type SwitchKeyEvent,
} from './orbitHintPlan.js';

const key = (over: Partial<SwitchKeyEvent> = {}): SwitchKeyEvent => ({
  key: 'Enter', repeat: false, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, defaultPrevented: false,
  target: { tagName: 'BODY' }, ...over,
});

describe('nápoveda k orbitu v zamknutom pohľade zhora (AIMviewer#188)', () => {
  it('orbit je zablokovaný len pri zámku počas kalibrácie, stály zámok bez kalibrácie neblokuje', () => {
    assert.equal(orbitBlocked({ underlayViewLocked: true, underlayCalibration: {} }), true);
    assert.equal(orbitBlocked({ underlayViewLocked: true, underlayCalibration: null }), false);
    assert.equal(orbitBlocked({ underlayViewLocked: false, underlayCalibration: {} }), false);
  });

  it('nápoveda až po skutočnom ťahaní a s pauzou; bežný posun a zoom v odblokovanom pohľade ju nespustia', () => {
    assert.equal(shouldShowOrbitHint(true, ORBIT_ATTEMPT_PX, 1000, null), true);
    assert.equal(shouldShowOrbitHint(true, ORBIT_ATTEMPT_PX - 1, 1000, null), false);
    assert.equal(shouldShowOrbitHint(false, 500, 1000, null), false);
    assert.equal(shouldShowOrbitHint(true, 50, 1000 + ORBIT_HINT_COOLDOWN_MS - 1, 1000), false);
    assert.equal(shouldShowOrbitHint(true, 50, 1000 + ORBIT_HINT_COOLDOWN_MS, 1000), true);
  });

  it('Enter aj medzerník prepnú do 3D', () => {
    assert.equal(isSwitchTo3dKey(true, key()), true);
    assert.equal(isSwitchTo3dKey(true, key({ key: ' ' })), true);
  });

  it('mimo zámku, v inputoch, tlačidlách, s modifikátorom, pri opakovaní a iné klávesy ne', () => {
    assert.equal(isSwitchTo3dKey(false, key()), false);
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'input']) assert.equal(isSwitchTo3dKey(true, key({ target: { tagName } })), false, tagName);
    assert.equal(isSwitchTo3dKey(true, key({ target: { tagName: 'DIV', isContentEditable: true } })), false);
    assert.equal(isSwitchTo3dKey(true, key({ ctrlKey: true })), false);
    assert.equal(isSwitchTo3dKey(true, key({ shiftKey: true })), false);
    assert.equal(isSwitchTo3dKey(true, key({ repeat: true })), false);
    assert.equal(isSwitchTo3dKey(true, key({ defaultPrevented: true })), false);
    assert.equal(isSwitchTo3dKey(true, key({ key: 'a' })), false);
  });
});

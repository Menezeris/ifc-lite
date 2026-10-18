/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { isViewMessage } from './view-protocol.js';
import { VIEWER_AXIS, cameraStep, pickStorey, storeyCutPercent } from './viewCommands.js';
import {
  cutPercent, hostAxis, ifcCoordinateToRender, renderBoxToIfc, renderPointToIfc, sectionThroughBox, unionBoxes,
  viewerAxis,
} from './viewFrame.js';

const S = 'aim-bridge';
const G = '27hbQtAoP6qvoEYhPARoI7';

describe('isViewMessage (AIM D-083)', () => {
  it('prijme rez nad podlažím, zvislý rez, zrušenie, kameru a režim', () => {
    for (const msg of [
      { source: S, type: 'SET_SECTION', action: 'set', axis: 'y', storeyGuid: G, offsetM: -0.4 },
      { source: S, type: 'SET_SECTION', action: 'set', storeyGuid: G },
      { source: S, type: 'SET_SECTION', action: 'set', axis: 'x', position: 40, flipped: true },
      { source: S, type: 'SET_SECTION', action: 'clear' },
      { source: S, type: 'SET_CAMERA', preset: 'top', projection: 'orthographic', guids: [G] },
      { source: S, type: 'SET_CAMERA', preset: 'iso' },
      { source: S, type: 'SET_VIEW_MODE', mode: '2d', storeyGuid: G },
      { source: S, type: 'SET_VIEW_MODE', mode: '3d' },
      // D-085: rez cez prvok, na súradnici IFC sveta a otázky na stav.
      { source: S, type: 'SET_SECTION', action: 'set', guids: [G], fit: 'along' },
      { source: S, type: 'SET_SECTION', action: 'set', guids: [G], fit: 'across', flipped: true },
      { source: S, type: 'SET_SECTION', action: 'set', guids: [G], axis: 'y' },
      { source: S, type: 'SET_SECTION', action: 'set', guids: [G], fit: 'center', axis: 'x' },
      { source: S, type: 'SET_SECTION', action: 'set', axis: 'z', coordinate: -12.5 },
      { source: S, type: 'QUERY', id: 'q1', query: 'bounds', guids: [G] },
      { source: S, type: 'QUERY', id: 'q2', query: 'bounds' },
      { source: S, type: 'QUERY', id: 'q3', query: 'view_state' },
    ]) {
      assert.equal(isViewMessage(msg), true, JSON.stringify(msg));
    }
  });

  it('odmietne cudzí zdroj, zlé hodnoty a správy, ktoré nie sú pohľad', () => {
    for (const msg of [
      { source: 'x', type: 'SET_SECTION', action: 'clear' },
      { source: S, type: 'SET_SECTION', action: 'set' },
      { source: S, type: 'SET_SECTION', action: 'set', axis: 'x', storeyGuid: G },
      { source: S, type: 'SET_SECTION', action: 'set', storeyGuid: G, offsetM: 99 },
      { source: S, type: 'SET_SECTION', action: 'set', axis: 'z', position: 140 },
      { source: S, type: 'SET_CAMERA', preset: 'diagonal' },
      { source: S, type: 'SET_CAMERA', preset: 'top', guids: [1, 2] },
      { source: S, type: 'SET_VIEW_MODE', mode: '4d' },
      { source: S, type: 'SELECT', guid: G },
      // along/across volí os sám, stredom treba os; prázdny cieľ a súradnica bez osi neplatia.
      { source: S, type: 'SET_SECTION', action: 'set', guids: [G], fit: 'along', axis: 'x' },
      { source: S, type: 'SET_SECTION', action: 'set', guids: [G] },
      { source: S, type: 'SET_SECTION', action: 'set', guids: [], fit: 'along' },
      { source: S, type: 'SET_SECTION', action: 'set', guids: [G], fit: 'diagonal', axis: 'x' },
      { source: S, type: 'SET_SECTION', action: 'set', coordinate: 3 },
      { source: S, type: 'SET_SECTION', action: 'set', axis: 'x', coordinate: Number.NaN },
      { source: S, type: 'QUERY', query: 'bounds' },
      { source: S, type: 'QUERY', id: 'x'.repeat(65), query: 'bounds' },
      { source: S, type: 'QUERY', id: 'q', query: 'screenshot' },
      { source: S, type: 'QUERY', id: 'q', query: 'bounds', guids: Array(101).fill(G) },
      null,
    ]) {
      assert.equal(isViewMessage(msg), false, JSON.stringify(msg));
    }
  });
});

describe('viewCommands (AIM D-083)', () => {
  it('rez nad podlažím: elevácia IFC + výška - posun rámca, v percentách osi', () => {
    // Model od 0 do 20 m; podlažie na 5 m; rez 1,2 m nad ním; rámec posunutý o 2 m.
    assert.ok(Math.abs((storeyCutPercent(5, 1.2, 2, { min: 0, max: 20 }) ?? NaN) - 21) < 1e-9);
    assert.equal(storeyCutPercent(5, 1.2, 0, null), null);
    // Mimo rozsahu sa oreže na okraj.
    assert.equal(storeyCutPercent(30, 0, 0, { min: 0, max: 20 }), 100);
  });

  it('osi a presety', () => {
    assert.deepEqual(VIEWER_AXIS, { x: 'side', y: 'down', z: 'front' });
    assert.deepEqual(cameraStep('iso'), { kind: 'home' });
    assert.deepEqual(cameraStep('fit_all'), { kind: 'fit' });
    assert.deepEqual(cameraStep('front'), { kind: 'preset', view: 'front' });
  });

  it('neznáme podlažie sa nevykoná, chýbajúce nechá výber na viewri', () => {
    const storeys = [{ guid: 'A' }, { guid: 'B' }];
    assert.deepEqual(pickStorey(storeys, 'B'), { guid: 'B' });
    // strictEqual: `undefined` (viewer chooses) and `null` (skip) must not blur.
    assert.strictEqual(pickStorey(storeys, undefined), undefined);
    assert.strictEqual(pickStorey(storeys, 'X'), null);
  });
});

describe('rez cez prvok a IFC svet (AIM D-085)', () => {
  // Render rámec je Y hore a posunutý; IFC svet je Z hore. offset = render -> IFC (Z hore).
  const offset = { x: 100, y: 200, z: 10 };

  it('render bod -> IFC svet a späť cez súradnicu roviny', () => {
    const render = { x: 1, y: 2, z: 3 };
    // IFC = (x, -z, y) + offset
    assert.deepEqual(renderPointToIfc(render, offset), { x: 101, y: 197, z: 12 });
    const ifc = renderPointToIfc(render, offset);
    assert.equal(ifcCoordinateToRender('x', ifc.x, offset), 1);
    assert.equal(ifcCoordinateToRender('y', ifc.z, offset), 2);
    assert.equal(ifcCoordinateToRender('z', ifc.y, offset), 3);
  });

  it('obálka do IFC sveta: otočená os si vymení min a max', () => {
    const box = renderBoxToIfc({ min: { x: 0, y: 0, z: 1 }, max: { x: 4, y: 3, z: 5 } }, offset);
    assert.deepEqual(box, { min: { x: 100, y: 195, z: 10 }, max: { x: 104, y: 199, z: 13 } });
  });

  it('pozdĺž a naprieč podľa dlhšej vodorovnej osi, stredom na zadanej osi', () => {
    // Rameno schodiska dlhé v X (6 m), úzke v Z (1,2 m).
    const stair = { min: { x: 0, y: 0, z: 2 }, max: { x: 6, y: 3, z: 3.2 } };
    assert.deepEqual(sectionThroughBox(stair, 'along'), { axis: 'z', world: 2.6 });
    assert.deepEqual(sectionThroughBox(stair, 'across'), { axis: 'x', world: 3 });
    // Dlhé v Z: osi sa vymenia.
    const turned = { min: { x: 2, y: 0, z: 0 }, max: { x: 3.2, y: 3, z: 6 } };
    assert.deepEqual(sectionThroughBox(turned, 'along'), { axis: 'x', world: 2.6 });
    assert.deepEqual(sectionThroughBox(turned, 'across'), { axis: 'z', world: 3 });
    assert.deepEqual(sectionThroughBox(stair, 'center', 'y'), { axis: 'y', world: 1.5 });
    assert.equal(sectionThroughBox(stair, 'center'), null);
  });

  it('zjednotenie obálok, inverz osí a poloha v percentách', () => {
    assert.equal(unionBoxes([]), null);
    assert.deepEqual(
      unionBoxes([{ min: { x: 0, y: 1, z: 2 }, max: { x: 1, y: 2, z: 3 } }, { min: { x: -1, y: 5, z: 0 }, max: { x: 0, y: 6, z: 9 } }]),
      { min: { x: -1, y: 1, z: 0 }, max: { x: 1, y: 6, z: 9 } },
    );
    for (const axis of ['x', 'y', 'z'] as const) {
      assert.equal(hostAxis(VIEWER_AXIS[axis]), axis);
      assert.equal(viewerAxis(axis), VIEWER_AXIS[axis]);
    }
    assert.equal(cutPercent(5, { min: 0, max: 20 }), 25);
    assert.equal(cutPercent(5, null), null);
  });
});

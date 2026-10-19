/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { isViewMessage } from './view-protocol.js';
import { cameraStep } from './viewCommands.js';
import { ifcDirToRender, ifcPointToRender, renderDirToIfc, renderPointToIfc } from './viewFrame.js';

const S = 'aim-bridge';
const G = '27hbQtAoP6qvoEYhPARoI7';
const VP = { position: { x: 10, y: -20, z: 15 }, target: { x: 0, y: 0, z: 3 }, up: { x: 0, y: 0, z: 1 } };

describe('SET_CAMERA kamera (AIM D-098)', () => {
  it('prijme keep, section, fit, selektor a pózu od hosta', () => {
    for (const msg of [
      { source: S, type: 'SET_CAMERA', preset: 'keep', fit: 'visible' },
      { source: S, type: 'SET_CAMERA', preset: 'iso', fit: 'visible', projection: 'perspective' },
      { source: S, type: 'SET_CAMERA', preset: 'section', fit: 'selection' },
      { source: S, type: 'SET_CAMERA', preset: 'front', selector: { types: ['IfcStairFlight'] } },
      { source: S, type: 'SET_CAMERA', preset: 'keep', selector: { model: 'VZT' } },
      { source: S, type: 'SET_CAMERA', preset: 'keep', viewpoint: VP },
      { source: S, type: 'SET_CAMERA', preset: 'keep', viewpoint: { ...VP, orthoSize: 12.5 }, projection: 'orthographic' },
    ]) {
      assert.equal(isViewMessage(msg), true, JSON.stringify(msg));
    }
  });

  it('odmietne dva ciele, pózu s presetom a zlé hodnoty', () => {
    for (const msg of [
      { source: S, type: 'SET_CAMERA', preset: 'keep', fit: 'model' },
      { source: S, type: 'SET_CAMERA', preset: 'top', guids: [G], fit: 'visible' },
      { source: S, type: 'SET_CAMERA', preset: 'top', guids: [G], selector: { types: ['IfcWall'] } },
      { source: S, type: 'SET_CAMERA', preset: 'keep', selector: {} },
      { source: S, type: 'SET_CAMERA', preset: 'keep', selector: { types: [1] } },
      // Póza nahrádza smer: s presetom by si odporovali.
      { source: S, type: 'SET_CAMERA', preset: 'top', viewpoint: VP },
      { source: S, type: 'SET_CAMERA', preset: 'keep', viewpoint: { ...VP, up: { x: 0, y: 0, z: 0 } } },
      { source: S, type: 'SET_CAMERA', preset: 'keep', viewpoint: { ...VP, position: { x: Number.NaN, y: 0, z: 0 } } },
      { source: S, type: 'SET_CAMERA', preset: 'keep', viewpoint: { ...VP, orthoSize: 0 } },
      { source: S, type: 'SET_CAMERA', preset: 'keep', viewpoint: { position: VP.position, target: VP.target } },
    ]) {
      assert.equal(isViewMessage(msg), false, JSON.stringify(msg));
    }
  });

  it('keep a section majú vlastný krok, nie preset ViewCube', () => {
    assert.deepEqual(cameraStep('keep'), { kind: 'keep' });
    assert.deepEqual(cameraStep('section'), { kind: 'section' });
  });

  it('póza z IFC sveta do render rámca a späť', () => {
    const offset = { x: 100, y: 200, z: 10 };
    const ifc = { x: 101, y: 197, z: 12 };
    assert.deepEqual(ifcPointToRender(ifc, offset), { x: 1, y: 2, z: 3 });
    assert.deepEqual(renderPointToIfc(ifcPointToRender(ifc, offset), offset), ifc);
    // IFC Z hore = render Y hore; smer sa neposúva o rámec.
    assert.deepEqual(ifcDirToRender({ x: 0, y: 0, z: 1 }), { x: 0, y: 1, z: 0 });
    assert.deepEqual(renderDirToIfc({ x: 0, y: 1, z: 0 }), { x: 0, y: 0, z: 1 });
  });
});

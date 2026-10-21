/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { pickArea, screenAxes, type ScreenAxes } from './cameraArea.js';
import type { Box3 } from './viewFrame.js';

const box = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): Box3 => ({
  min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ },
});

/**
 * Strecha 30 x 12 m v render rámci (Y hore), atiky 0,3 m hrubé a 1 m vysoké:
 * ľavá a pravá po hĺbke (Z), predná a zadná cez celú šírku (X).
 */
const LEFT = box(0, 10, 0, 0.3, 11, 12);
const RIGHT = box(29.7, 10, 0, 30, 11, 12);
const FRONT = box(0, 10, 11.7, 30, 11, 12);
const BACK = box(0, 10, 0, 30, 11, 0.3);
const PARAPETS = [LEFT, RIGHT, FRONT, BACK];

/** Pohľad spredu kolmo na rez (kamera na +Z, pozerá na -Z): doprava = +X, hore = +Y. */
const FROM_FRONT: ScreenAxes = { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, forward: { x: 0, y: 0, z: -1 } };

describe('screenAxes (AIM D-128)', () => {
  it('pohľad spredu: doprava +X, hore +Y, smer pohľadu -Z', () => {
    // deepEqual: -0 z vektorového súčinu je to isté ako 0.
    assert.deepEqual(screenAxes({ position: { x: 0, y: 0, z: 10 }, target: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } }), FROM_FRONT);
  });
  it('degenerovaná póza = null', () => {
    assert.strictEqual(screenAxes({ position: { x: 1, y: 1, z: 1 }, target: { x: 1, y: 1, z: 1 }, up: { x: 0, y: 1, z: 0 } }), null);
    assert.strictEqual(screenAxes({ position: { x: 0, y: 10, z: 0 }, target: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } }), null);
  });
});

describe('pickArea (AIM D-128, AIMviewer#172)', () => {
  it('atika vľavo: len ľavá, prvky cez celú šírku nie', () => {
    assert.deepStrictEqual(pickArea(PARAPETS, 'left', FROM_FRONT), [0]);
    assert.deepStrictEqual(pickArea(PARAPETS, 'right', FROM_FRONT), [1]);
  });
  it('front/back podľa vzdialenosti od kamery', () => {
    assert.deepStrictEqual(pickArea(PARAPETS, 'front', FROM_FRONT), [2]);
    assert.deepStrictEqual(pickArea(PARAPETS, 'back', FROM_FRONT), [3]);
  });
  it('top/bottom po výške obrazu', () => {
    const floors = [box(0, 0, 0, 30, 0.3, 12), box(0, 3, 0, 30, 3.3, 12), box(0, 6, 0, 30, 6.3, 12)];
    assert.deepStrictEqual(pickArea(floors, 'top', FROM_FRONT), [2]);
    assert.deepStrictEqual(pickArea(floors, 'bottom', FROM_FRONT), [0]);
  });
  it('otočený pohľad zozadu prehodí ľavú a pravú stranu', () => {
    const fromBack: ScreenAxes = { right: { x: -1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, forward: { x: 0, y: 0, z: 1 } };
    assert.deepStrictEqual(pickArea(PARAPETS, 'left', fromBack), [1]);
  });
  it('viac prvkov v tretine vráti všetky', () => {
    assert.deepStrictEqual(pickArea([LEFT, box(1, 0, 0, 2, 1, 1), RIGHT], 'left', FROM_FRONT), [0, 1]);
  });
  it('prázdna tretina: prvok najbližšie k okraju, nikdy nič', () => {
    const wide = [box(0, 0, 0, 30, 1, 1), box(5, 0, 0, 29, 1, 1)];
    assert.deepStrictEqual(pickArea(wide, 'left', FROM_FRONT), [0]);
    assert.deepStrictEqual(pickArea(wide, 'right', FROM_FRONT), [1]);
  });
  it('jeden alebo žiadny prvok ostáva', () => {
    assert.deepStrictEqual(pickArea([FRONT], 'left', FROM_FRONT), [0]);
    assert.deepStrictEqual(pickArea([], 'left', FROM_FRONT), []);
  });
});

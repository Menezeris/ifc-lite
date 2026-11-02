/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useViewerStore } from '@/store/index.js';
import { addBoxCut, boxForSelection } from './sectionBoxScene.js';
import { BOXES, FAR_WALL, FLOOR, SPACE, WALL_L, seedBoxCutModel } from './sectionBoxScene.test-support.js';

const close = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-5, `${a} vs ${b}`));
const box = () => useViewerStore.getState().sectionPlane.box;

beforeEach(seedBoxCutModel);

describe('Box cut v scéne (AIM)', () => {
  it('miestnosť: od spodku podlahovej po vrch stropnej dosky, vodorovne so stenami (vzdialená stena nič nerozšíri)', () => {
    assert.equal(addBoxCut([SPACE]), true);
    assert.ok(box());
    close(box()!.min, [-0.2, -0.25, -0.2]);
    close(box()!.max, [4.2, 2.95, 3.2]);
  });

  it('iný prvok: obálka s okrajom 20 % najdlhšej strany (min 0,3 m, max 2 m)', () => {
    assert.equal(addBoxCut([FAR_WALL]), true); // 0,2 x 2,7 x 4 m -> 0,8 m
    const [x0, y0, z0, x1, y1, z1] = BOXES[FAR_WALL];
    close(box()!.min, [x0 - 0.8, y0 - 0.8, z0 - 0.8]);
    close(box()!.max, [x1 + 0.8, y1 + 0.8, z1 + 0.8]);
  });

  it('bez ids: obálka výberu z Frame (selectionBounds) s okrajom; Fit dá ten istý box', () => {
    const [x0, y0, z0, x1, y1, z1] = BOXES[WALL_L];
    useViewerStore.setState({
      selectedEntityId: WALL_L,
      cameraCallbacks: { selectionBounds: () => ({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } }) },
    });
    assert.equal(addBoxCut(), true); // 0,2 x 2,7 x 3,4 m -> okraj 0,68 m
    close(box()!.min, [x0 - 0.68, y0 - 0.68, z0 - 0.68]);
    close(box()!.max, [x1 + 0.68, y1 + 0.68, z1 + 0.68]);
    assert.deepEqual(boxForSelection(), box());
  });

  it('vybraná miestnosť má prednosť pred obálkou z Frame: so skladbami', () => {
    useViewerStore.setState({
      selectedEntityId: SPACE,
      cameraCallbacks: { selectionBounds: () => ({ min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 2.7, z: 3 } }) },
    });
    assert.equal(addBoxCut(), true);
    close(box()!.max, [4.2, 2.95, 3.2]);
  });

  it('bez výberu a bez obálky nič nevznikne', () => {
    useViewerStore.setState({ selectedEntityId: null, cameraCallbacks: { selectionBounds: () => null } });
    assert.equal(addBoxCut(), false);
    assert.equal(box() ?? null, null);
  });

  it('prvok bez geometrie: false a žiadna rovina', () => {
    assert.equal(addBoxCut([9999]), false);
    assert.equal(box() ?? null, null);
  });

  it('doska sama nie je miestnosť: okraj, nie obálka stien', () => {
    assert.equal(addBoxCut([FLOOR]), true);
    close(box()!.min, [-0.2 - 0.88, -0.25 - 0.88, -0.2 - 0.88]); // 4,4 m * 0,2 = 0,88 m
  });
});

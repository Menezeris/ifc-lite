/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import type { FederatedModel } from '@/store';
import { fixtureModel } from '@/test/store-fixture';
import { emptyPlacementState } from '@/lib/model-placement/state';
import { mergedSectionBounds, percentToWorld, sectionAxisRange } from '@/lib/section/section-distance';
import { storeyCutPercent } from './viewCommands.js';
import { sectionRenderBounds } from './sectionRange.js';

type Place = Parameters<typeof sectionRenderBounds>[1];
/** Bez umiestnenia: obálka ostáva zjednotenie modelov. */
const unplaced: Place = (source) => source;
/** Ako `placementCoordinateInfo` so živou scénou, kde je VZT posunutý o +15 m hore (render Y). */
const vztRaised: Place = (source) => source && {
  ...source,
  shiftedBounds: { min: source.shiftedBounds.min, max: { ...source.shiftedBounds.max, y: 8.24 + 15 } },
};

/** Dva modely federácie s obálkami ako v živom teste (FZK-Haus + AB22), render rámec Y hore. */
function federation(): Map<string, FederatedModel> {
  const model = (id: string, minY: number, maxY: number): FederatedModel => ({
    ...fixtureModel(id),
    geometryResult: {
      meshes: [], totalTriangles: 0, totalVertices: 0,
      coordinateInfo: {
        originShift: { x: 0, y: 0, z: 0 },
        originalBounds: { min: { x: 0, y: minY, z: 0 }, max: { x: 10, y: maxY, z: 10 } },
        shiftedBounds: { min: { x: 0, y: minY, z: 0 }, max: { x: 10, y: maxY, z: 10 } },
        hasLargeCoordinates: false,
      },
    },
  } as FederatedModel);
  return new Map([['asr', model('asr', -1, 6.32)], ['vzt', model('vzt', -1.49, 8.24)]]);
}

describe('obálka rezu = obálka renderera (AIM #63)', () => {
  it('bez posunu modelov je to zjednotenie obálok modelov', () => {
    const models = federation();
    const state = { models, geometryResult: null, modelPlacement: emptyPlacementState() };
    assert.deepEqual(sectionRenderBounds(state, unplaced), mergedSectionBounds(models, null));
  });

  it('posunutý model mení obálku, rez nad podlažím padne presne na eleváciu + offset', () => {
    const models = federation();
    const state = { models, geometryResult: null, modelPlacement: emptyPlacementState() };
    const bounds = sectionRenderBounds(state, vztRaised);
    assert.ok(bounds);
    // Renderer reže voči posunutej obálke (VZT +15 m hore), nie voči holému zjednoteniu.
    assert.ok(Math.abs(bounds.max.y - 23.24) < 1e-9, String(bounds.max.y));
    const range = sectionAxisRange(bounds, 'down');
    assert.ok(range);
    for (const [elevation, offset] of [[2.7, 1], [2.7, -2], [9.2, 1]] as const) {
      const world = percentToWorld(storeyCutPercent(elevation, offset, 0, range) ?? NaN, range);
      assert.ok(Math.abs(world - (elevation + offset)) < 1e-9, `${elevation}+${offset} -> ${world}`);
    }
    // Pred opravou (holé zjednotenie) by percento padlo inde.
    const bare = sectionAxisRange(mergedSectionBounds(models, null), 'down');
    assert.ok(bare);
    const wrong = percentToWorld(storeyCutPercent(2.7, 1, 0, bare) ?? NaN, range);
    assert.ok(Math.abs(wrong - 3.7) > 1);
  });

  it('nič načítané = null', () => {
    assert.equal(sectionRenderBounds({ models: new Map(), geometryResult: null, modelPlacement: emptyPlacementState() }, vztRaised), null);
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  REFIT_MIN_DELTA_PX, REFIT_MIN_SIZE_PX, REFIT_SETTLE_MS, createPlanRefit, shouldRefit,
  type RefitContext, type Size,
} from './planRefit.js';

const PLAN: RefitContext = { planInCanvas: true, lockedTopDown: true };
const size = (width: number, height = 700): Size => ({ width, height });

/** Falošný časovač: `advance` spustí splatné funkcie, `fits` počíta prispôsobenia. */
function harness(ctx: () => RefitContext = () => PLAN) {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let fits = 0;
  const refit = createPlanRefit({
    context: ctx,
    fit: () => { fits++; },
    setTimer: (fn, ms) => { const id = nextId++; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimer: (id) => { timers.delete(id as number); },
  });
  return {
    refit,
    advance(ms: number) {
      now += ms;
      for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn(); }
    },
    fits: () => fits,
  };
}

describe('shouldRefit: kedy sa pôdorys prispôsobí zmene veľkosti (AIM #211)', () => {
  it('pôdorys v canvase a veľkosť sa zmenila: áno', () => {
    assert.equal(shouldRefit(size(1200), size(900), PLAN), true);
    assert.equal(shouldRefit(size(900, 600), size(900, 700), PLAN), true, 'aj len výška');
  });

  it('šum rozloženia pod prahom: nie', () => {
    assert.equal(shouldRefit(size(1000), size(1000 + REFIT_MIN_DELTA_PX - 1), PLAN), false);
    assert.equal(shouldRefit(size(1000), size(1000 - REFIT_MIN_DELTA_PX), PLAN), true, 'presne prah už áno');
  });

  it('voľná 3D, uložený pohľad alebo dokument: pohľad používateľa sa nemení', () => {
    assert.equal(shouldRefit(size(1200), size(900), { planInCanvas: false, lockedTopDown: true }), false);
    assert.equal(shouldRefit(size(1200), size(900), { planInCanvas: true, lockedTopDown: false }), false);
  });

  it('zbalená plocha (dokument na celú plochu) nie je pohľad na vyplnenie', () => {
    assert.equal(shouldRefit(size(1200), size(REFIT_MIN_SIZE_PX - 1), PLAN), false);
    assert.equal(shouldRefit(size(1200), size(900, REFIT_MIN_SIZE_PX - 1), PLAN), false);
  });

  it('bez východiskovej veľkosti sa nič neprispôsobuje', () => {
    assert.equal(shouldRefit(null, size(900), PLAN), false);
  });
});

describe('createPlanRefit: ťahanie úchytky stĺpca vyvolá jedno prispôsobenie po ustálení', () => {
  it('desiatky zmien veľkosti počas ťahania = jedno fit po tichu', () => {
    const h = harness();
    h.refit.resized(size(1200));
    h.advance(REFIT_SETTLE_MS);
    for (let w = 1190; w >= 900; w -= 10) { h.refit.resized(size(w)); h.advance(16); }
    assert.equal(h.fits(), 0, 'počas ťahania sa nič nehýbe');
    h.advance(REFIT_SETTLE_MS);
    assert.equal(h.fits(), 1);
  });

  it('prvé rozloženie pri štarte len zapíše východiskovú veľkosť', () => {
    const h = harness();
    h.refit.resized(size(1200));
    h.advance(REFIT_SETTLE_MS * 2);
    assert.equal(h.fits(), 0);
  });

  it('návrat na pôvodnú veľkosť pred ustálením nič neprispôsobí', () => {
    const h = harness();
    h.refit.resized(size(1200));
    h.advance(REFIT_SETTLE_MS);
    h.refit.resized(size(800));
    h.advance(50);
    h.refit.resized(size(1200));
    h.advance(REFIT_SETTLE_MS);
    assert.equal(h.fits(), 0);
  });

  it('ďalšie ustálenie sa porovnáva s poslednou ustálenou veľkosťou', () => {
    const h = harness();
    h.refit.resized(size(1200));
    h.advance(REFIT_SETTLE_MS);
    h.refit.resized(size(900));
    h.advance(REFIT_SETTLE_MS);
    h.refit.resized(size(900.5));
    h.advance(REFIT_SETTLE_MS);
    h.refit.resized(size(1100));
    h.advance(REFIT_SETTLE_MS);
    assert.equal(h.fits(), 2);
  });

  it('kontext sa číta až po ustálení: záložka prepnutá počas ťahania rozhoduje', () => {
    let ctx = PLAN;
    const h = harness(() => ctx);
    h.refit.resized(size(1200));
    h.advance(REFIT_SETTLE_MS);
    h.refit.resized(size(900));
    ctx = { planInCanvas: false, lockedTopDown: false };
    h.advance(REFIT_SETTLE_MS);
    assert.equal(h.fits(), 0);
  });

  it('dispose zruší čakajúce prispôsobenie', () => {
    const h = harness();
    h.refit.resized(size(1200));
    h.advance(REFIT_SETTLE_MS);
    h.refit.resized(size(900));
    h.refit.dispose();
    h.advance(REFIT_SETTLE_MS * 2);
    assert.equal(h.fits(), 0);
  });
});

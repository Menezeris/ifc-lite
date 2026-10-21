/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import type { SectionCapStyle } from '@/store/types';
import { applySectionCap, isSectionCapMessage, planSectionCap } from './sectionCap.js';

const S = 'aim-bridge';
const style = (pattern: SectionCapStyle['pattern']): SectionCapStyle => ({
  fillColor: [0.92, 0.88, 0.78, 0.5],
  strokeColor: [0.1, 0.1, 0.1, 1],
  pattern,
  spacingPx: 8,
  angleRad: Math.PI / 4,
  widthPx: 1,
  secondaryAngleRad: -Math.PI / 4,
});

describe('isSectionCapMessage', () => {
  it('prijme platné správy', () => {
    for (const m of [
      { source: S, type: 'SET_SECTION_CAP', cap: 'none' },
      { source: S, type: 'SET_SECTION_CAP', cap: 'solid', fillColor: '#FFaa00' },
      { source: S, type: 'SET_SECTION_CAP', cap: 'hatch' },
      { source: S, type: 'SET_SECTION_CAP', cap: 'hatch', pattern: 'crossHatch', angleDeg: 45, secondaryAngleDeg: -45, spacingPx: 8, widthPx: 1 },
      { source: S, type: 'SET_SECTION_CAP', cap: 'hatch', pattern: 'concrete', spacingPx: 64, widthPx: 16 },
    ]) assert.ok(isSectionCapMessage(m), JSON.stringify(m));
  });
  it('odmietne cudzí zdroj, neznámy vzhľad a zlú farbu', () => {
    for (const m of [
      { source: 'x', type: 'SET_SECTION_CAP', cap: 'none' },
      { source: S, type: 'SET_SECTION_CAP', cap: 'brick' },
      { source: S, type: 'SET_SECTION_CAP' },
      { source: S, type: 'SET_SECTION_CAP', cap: 'solid', fillColor: 'red' },
      { source: S, type: 'SET_SECTION_CAP', cap: 'solid', fillColor: '#fff' },
      // Vzor šrafy len pri hatch, len vzory renderera a rozsahy popoveru Cap (AIM D-128).
      { source: S, type: 'SET_SECTION_CAP', cap: 'solid', pattern: 'diagonal' },
      { source: S, type: 'SET_SECTION_CAP', cap: 'hatch', pattern: 'solid' },
      { source: S, type: 'SET_SECTION_CAP', cap: 'hatch', pattern: 'zigzag' },
      { source: S, type: 'SET_SECTION_CAP', cap: 'hatch', pattern: 'diagonal', angleDeg: 200 },
      { source: S, type: 'SET_SECTION_CAP', cap: 'hatch', pattern: 'diagonal', spacingPx: 1 },
      { source: S, type: 'SET_SECTION_CAP', cap: 'hatch', pattern: 'diagonal', widthPx: '2' },
      null,
    ]) assert.ok(!isSectionCapMessage(m), JSON.stringify(m));
  });
});

describe('planSectionCap', () => {
  it('none skryje plochy a zapamätá si šrafu', () => {
    assert.deepStrictEqual(planSectionCap({ showCap: true, capStyle: style('brick') }, { cap: 'none' }),
      { showCap: false, remember: 'brick' });
  });
  it('solid zapne plnú výplň a farbu so zachovanou priehľadnosťou', () => {
    const plan = planSectionCap({ showCap: false, capStyle: style('diagonal') }, { cap: 'solid', fillColor: '#ff8000' });
    assert.strictEqual(plan.showCap, true);
    assert.strictEqual(plan.style?.pattern, 'solid');
    assert.deepStrictEqual(plan.style?.fillColor, [1, 128 / 255, 0, 0.5]);
    assert.strictEqual(plan.remember, 'diagonal');
  });
  it('hatch nechá aktuálnu šrafu, z plnej výplne sa vráti na zapamätanú', () => {
    assert.strictEqual(planSectionCap({ showCap: false, capStyle: style('crossHatch') }, { cap: 'hatch' }).style?.pattern, 'crossHatch');
    assert.strictEqual(planSectionCap({ showCap: true, capStyle: style('solid') }, { cap: 'hatch' }, 'concrete').style?.pattern, 'concrete');
    assert.strictEqual(planSectionCap({ showCap: true, capStyle: style('solid') }, { cap: 'hatch' }).style?.pattern, 'diagonal');
  });
  it('hatch so vzorom od hosta zapíše vzor, uhly, rozstup a hrúbku a zapamätá si ho (AIM D-128)', () => {
    const plan = planSectionCap({ showCap: true, capStyle: { ...style('vertical'), angleRad: 0 } },
      { cap: 'hatch', pattern: 'crossHatch', angleDeg: 30, secondaryAngleDeg: -60, spacingPx: 12, widthPx: 2 });
    assert.strictEqual(plan.style?.pattern, 'crossHatch');
    assert.ok(Math.abs((plan.style?.angleRad ?? 0) - Math.PI / 6) < 1e-12);
    assert.ok(Math.abs((plan.style?.secondaryAngleRad ?? 0) + Math.PI / 3) < 1e-12);
    assert.strictEqual(plan.style?.spacingPx, 12);
    assert.strictEqual(plan.style?.widthPx, 2);
    assert.strictEqual(plan.remember, 'crossHatch');
  });
  it('bez vzoru hatch uhol ani rozstup nemení (staré správanie D-120)', () => {
    const plan = planSectionCap({ showCap: true, capStyle: style('diagonal') }, { cap: 'hatch', angleDeg: 10, spacingPx: 20 });
    assert.deepStrictEqual(plan.style, { pattern: 'diagonal' });
  });
});

describe('applySectionCap', () => {
  function store(showCap: boolean, pattern: SectionCapStyle['pattern']) {
    const calls: string[] = [];
    const s = {
      sectionPlane: { showCap, capStyle: style(pattern) },
      setSectionShowCap: (v: boolean) => { calls.push(`show:${v}`); s.sectionPlane.showCap = v; },
      setSectionCapStyle: (p: Partial<SectionCapStyle>) => { calls.push(`style:${p.pattern}`); s.sectionPlane.capStyle = { ...s.sectionPlane.capStyle, ...p }; },
    };
    return { s, calls };
  }
  it('solid -> hatch vráti šrafu, ktorá bola pred plnou výplňou', () => {
    const { s, calls } = store(true, 'insulation');
    applySectionCap({ source: S, type: 'SET_SECTION_CAP', cap: 'solid' }, () => s);
    applySectionCap({ source: S, type: 'SET_SECTION_CAP', cap: 'hatch' }, () => s);
    assert.deepStrictEqual(calls, ['style:solid', 'style:insulation']);
  });
  it('none prepne len viditeľnosť plôch', () => {
    const { s, calls } = store(true, 'diagonal');
    applySectionCap({ source: S, type: 'SET_SECTION_CAP', cap: 'none' }, () => s);
    assert.deepStrictEqual(calls, ['show:false']);
  });
  it('diagonála 45° od hosta prepíše uložený zvislý vzor (AIMviewer#173)', () => {
    const { s, calls } = store(false, 'vertical');
    applySectionCap({ source: S, type: 'SET_SECTION_CAP', cap: 'hatch', pattern: 'diagonal', angleDeg: 45, spacingPx: 8, widthPx: 1 }, () => s);
    assert.deepStrictEqual(calls, ['style:diagonal', 'show:true']);
    assert.ok(Math.abs(s.sectionPlane.capStyle.angleRad - Math.PI / 4) < 1e-12);
  });
});

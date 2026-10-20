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
    ]) assert.ok(isSectionCapMessage(m), JSON.stringify(m));
  });
  it('odmietne cudzí zdroj, neznámy vzhľad a zlú farbu', () => {
    for (const m of [
      { source: 'x', type: 'SET_SECTION_CAP', cap: 'none' },
      { source: S, type: 'SET_SECTION_CAP', cap: 'brick' },
      { source: S, type: 'SET_SECTION_CAP' },
      { source: S, type: 'SET_SECTION_CAP', cap: 'solid', fillColor: 'red' },
      { source: S, type: 'SET_SECTION_CAP', cap: 'solid', fillColor: '#fff' },
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
});

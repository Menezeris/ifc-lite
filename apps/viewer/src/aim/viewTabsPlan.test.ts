/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  activateTab, besidePair, besideRefusal, centerLayout, closeAll, closeTab, describeTabs, initialTabs,
  openTab, resolveTabRef, setBeside, syncDocTabs, type ViewTab,
} from './viewTabsPlan.js';
import { documentLayout, isTabsMessage } from './tabs-protocol.js';

const S = 'aim-bridge' as const;
const plan1: ViewTab = { id: 'plan:G1', kind: 'plan', label: '1NP', storeyGuid: 'G1' };
const plan2: ViewTab = { id: 'plan:G2', kind: 'plan', label: '2NP', storeyGuid: 'G2' };
const view: ViewTab = { id: 'view:V1', kind: 'view', label: 'Rez A-A', locked: true };
const doc = (id: string): { docId: string; label: string } => ({ docId: id, label: `${id}.pdf` });

describe('záložky viewera (AIM D-132)', () => {
  it('3D je vždy prvá, aktívna a nedá sa zavrieť', () => {
    const s = initialTabs();
    assert.deepStrictEqual(s.tabs.map((t) => t.id), ['3d']);
    assert.strictEqual(closeTab(s, '3d'), s);
    assert.deepStrictEqual(closeAll(openTab(openTab(s, plan1), view)).tabs.map((t) => t.id), ['3d']);
  });

  it('otvorenie pridá na koniec a aktivuje; druhé otvorenie len prepne a obnoví menovku', () => {
    let s = openTab(openTab(initialTabs(), plan1), view);
    assert.deepStrictEqual(s.tabs.map((t) => t.id), ['3d', 'plan:G1', 'view:V1']);
    assert.strictEqual(s.activeId, 'view:V1');
    s = openTab(s, { ...plan1, label: '1NP nové' });
    assert.strictEqual(s.tabs.length, 3);
    assert.strictEqual(s.activeId, 'plan:G1');
    assert.strictEqual(s.tabs[1].label, '1NP nové');
  });

  it('zavretie aktívnej prepne na predchádzajúcu, alebo na tú vedľa', () => {
    let s = openTab(openTab(initialTabs(), plan1), plan2);
    s = closeTab(s, 'plan:G2');
    assert.strictEqual(s.activeId, 'plan:G1');
    s = syncDocTabs(s, [doc('D1')], { docId: 'D1', beside: true });
    assert.strictEqual(s.besideId, 'doc:D1');
    s = closeTab(s, 'plan:G1');
    assert.strictEqual(s.activeId, 'doc:D1');
    assert.strictEqual(s.besideId, null);
  });

  it('vedľa seba: 3D + dokument, pohľad + dokument, 3D + pôdorys; nie dve 3D ani dva dokumenty', () => {
    let s = openTab(openTab(initialTabs(), plan1), view);
    s = syncDocTabs(s, [doc('D1'), doc('D2')], null);
    assert.deepStrictEqual(besidePair(s, '3d', 'doc:D1'), { active: '3d', beside: 'doc:D1' });
    assert.deepStrictEqual(besidePair(s, 'view:V1', 'doc:D1'), { active: 'view:V1', beside: 'doc:D1' });
    assert.deepStrictEqual(besidePair(s, 'plan:G1', '3d'), { active: '3d', beside: 'plan:G1' });
    assert.strictEqual(besidePair(s, 'plan:G1', 'view:V1'), null);
    assert.strictEqual(besidePair(s, 'doc:D1', 'doc:D2'), null);
    assert.match(besideRefusal(s, 'plan:G1', 'view:V1') ?? '', /jeden 3D canvas/);
    assert.match(besideRefusal(s, 'doc:D1', 'doc:D2') ?? '', /dva dokumenty/);
    assert.strictEqual(besideRefusal(s, '3d', 'doc:D1'), null);
    // Neprípustná dvojica stav nemení.
    const active = activateTab(s, 'view:V1');
    assert.strictEqual(setBeside(active, 'plan:G1'), active);
  });

  it('prepnutie na záložku vedľa vymení strany, na inú zruší neprípustnú dvojicu', () => {
    let s = syncDocTabs(openTab(initialTabs(), plan1), [doc('D1')], null);
    s = setBeside(activateTab(s, '3d'), 'doc:D1');
    s = activateTab(s, 'doc:D1');
    assert.deepStrictEqual([s.activeId, s.besideId], ['doc:D1', '3d']);
    // Pôdorys + dokument je prípustné: dvojica ostane.
    s = activateTab(s, 'plan:G1');
    assert.deepStrictEqual([s.activeId, s.besideId], ['plan:G1', '3d']);
    s = setBeside(s, null);
    assert.strictEqual(s.besideId, null);
  });

  it('karty dokumentov sa zosúladia s docTabs; otvorenie aktivuje, beside dá vedľa 3D', () => {
    let s = syncDocTabs(initialTabs(), [doc('D1')], { docId: 'D1', beside: false });
    assert.strictEqual(s.activeId, 'doc:D1');
    s = syncDocTabs(activateTab(s, '3d'), [doc('D1'), doc('D2')], { docId: 'D2', beside: true });
    assert.deepStrictEqual([s.activeId, s.besideId], ['3d', 'doc:D2']);
    s = syncDocTabs(s, [doc('D1')], null);
    assert.deepStrictEqual(s.tabs.map((t) => t.id), ['3d', 'doc:D1']);
    assert.strictEqual(s.besideId, null);
  });

  it('rozloženie: dokument sám = 3D zbalená, vedľa = oba, pôdorys vedľa 3D = panel plánu', () => {
    let s = syncDocTabs(openTab(initialTabs(), plan1), [doc('D1')], { docId: 'D1', beside: false });
    assert.deepStrictEqual(centerLayout(s), { collapse3d: true, docPane: true, docId: 'D1', planBeside: null });
    s = setBeside(activateTab(s, 'plan:G1'), 'doc:D1');
    assert.deepStrictEqual(centerLayout(s), { collapse3d: false, docPane: true, docId: 'D1', planBeside: null });
    s = setBeside(activateTab(s, '3d'), 'plan:G1');
    assert.deepStrictEqual(centerLayout(s), { collapse3d: false, docPane: false, docId: null, planBeside: 'G1' });
    // Dokument k dvojici 3D + pôdorys: pôdorys ostane ako 3D strana (zamknutý canvas), nie 2D panel.
    assert.deepStrictEqual(centerLayout(activateTab(s, 'doc:D1')), { collapse3d: false, docPane: true, docId: 'D1', planBeside: null });
  });

  it('odkaz z chatu: id, menovka bez veľkosti písmen, GlobalId podlažia, id dokumentu', () => {
    const s = syncDocTabs(openTab(openTab(initialTabs(), plan1), view), [doc('D1')], null);
    assert.strictEqual(resolveTabRef(s, '3D')?.id, '3d');
    assert.strictEqual(resolveTabRef(s, 'rez a-a')?.id, 'view:V1');
    assert.strictEqual(resolveTabRef(s, 'G1')?.id, 'plan:G1');
    assert.strictEqual(resolveTabRef(s, 'D1')?.id, 'doc:D1');
    assert.strictEqual(resolveTabRef(s, 'nič'), undefined);
    assert.strictEqual(resolveTabRef(s, '  '), undefined);
  });

  it('view_state.tabs: druh, menovka, podlažie, dokument, aktívna a vedľa', () => {
    const s = setBeside(syncDocTabs(openTab(initialTabs(), plan1), [doc('D1')], null), 'doc:D1');
    assert.deepStrictEqual(describeTabs(s), [
      { id: '3d', kind: '3d', label: '3D', active: false, beside: false },
      { id: 'plan:G1', kind: 'plan', label: '1NP', storey_guid: 'G1', active: true, beside: false },
      { id: 'doc:D1', kind: 'doc', label: 'D1.pdf', document_id: 'D1', active: false, beside: true },
    ]);
  });

  it('VIEW_TABS: open pôdorysu a pohľadu, activate/beside/close s odkazom, unbeside bez', () => {
    assert.ok(isTabsMessage({ source: S, type: 'VIEW_TABS', action: 'open', open: { kind: 'plan', storeyGuid: 'G1' } }));
    assert.ok(isTabsMessage({ source: S, type: 'VIEW_TABS', action: 'open', open: { kind: 'view', viewId: 'V1', label: 'Rez', locked: true }, beside: true }));
    assert.ok(!isTabsMessage({ source: S, type: 'VIEW_TABS', action: 'open', open: { kind: 'view', viewId: 'V1' } }));
    assert.ok(!isTabsMessage({ source: S, type: 'VIEW_TABS', action: 'open', open: { kind: 'plan' } }));
    assert.ok(!isTabsMessage({ source: S, type: 'VIEW_TABS', action: 'open', open: { kind: 'doc', storeyGuid: 'G1' } }));
    assert.ok(isTabsMessage({ source: S, type: 'VIEW_TABS', action: 'close', tab: 'all' }));
    assert.ok(!isTabsMessage({ source: S, type: 'VIEW_TABS', action: 'activate' }));
    assert.ok(isTabsMessage({ source: S, type: 'VIEW_TABS', action: 'unbeside' }));
    assert.ok(!isTabsMessage({ source: S, type: 'VIEW_TABS', action: 'unbeside', tab: '3d' }));
    assert.ok(!isTabsMessage({ source: 'x', type: 'VIEW_TABS', action: 'unbeside' }));
    assert.ok(!isTabsMessage({ source: S, type: 'VIEW_TABS', action: 'open', open: { kind: 'plan', storeyGuid: 'x'.repeat(201) } }));
  });

  it('DOCUMENT_OPEN layout: predvolene záložka, split len výslovne', () => {
    assert.strictEqual(documentLayout({ layout: 'split' }), 'split');
    assert.strictEqual(documentLayout({ layout: 'tab' }), 'tab');
    assert.strictEqual(documentLayout({}), 'tab');
    assert.strictEqual(documentLayout(null), 'tab');
  });
});

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
const doc = (id: string): { docId: string; label: string } => ({ docId: id, label: `${id}.pdf` });
const docTab = (id: string): ViewTab => ({ id: `doc:${id}`, kind: 'doc', label: `${id}.pdf`, docId: id });

describe('záložky viewera (AIM D-132, od D-161 len 3D a dokumenty)', () => {
  it('3D je vždy prvá, aktívna a nedá sa zavrieť', () => {
    const s = initialTabs();
    assert.deepStrictEqual(s.tabs.map((t) => t.id), ['3d']);
    assert.strictEqual(closeTab(s, '3d'), s);
    assert.deepStrictEqual(closeAll(openTab(openTab(s, docTab('D1')), docTab('D2'))).tabs.map((t) => t.id), ['3d']);
  });

  it('otvorenie pridá na koniec a aktivuje; druhé otvorenie len prepne a obnoví menovku', () => {
    let s = openTab(openTab(initialTabs(), docTab('D1')), docTab('D2'));
    assert.deepStrictEqual(s.tabs.map((t) => t.id), ['3d', 'doc:D1', 'doc:D2']);
    assert.strictEqual(s.activeId, 'doc:D2');
    s = openTab(s, { ...docTab('D1'), label: 'nové.pdf' });
    assert.strictEqual(s.tabs.length, 3);
    assert.strictEqual(s.activeId, 'doc:D1');
    assert.strictEqual(s.tabs[1].label, 'nové.pdf');
  });

  it('zavretie aktívnej prepne na predchádzajúcu, alebo na tú vedľa', () => {
    let s = syncDocTabs(initialTabs(), [doc('D1'), doc('D2')], null);
    s = activateTab(s, 'doc:D2');
    s = closeTab(s, 'doc:D2');
    assert.strictEqual(s.activeId, 'doc:D1');
    s = syncDocTabs(activateTab(s, '3d'), [doc('D1')], { docId: 'D1', beside: true });
    assert.strictEqual(s.besideId, 'doc:D1');
    s = closeTab(activateTab(s, '3d'), '3d');
    assert.strictEqual(s.activeId, '3d');
  });

  it('vedľa seba: 3D + dokument; nie dve 3D, dva dokumenty ani druhý druh záložky', () => {
    const s = syncDocTabs(initialTabs(), [doc('D1'), doc('D2')], null);
    assert.deepStrictEqual(besidePair(s, '3d', 'doc:D1'), { active: '3d', beside: 'doc:D1' });
    assert.deepStrictEqual(besidePair(s, 'doc:D1', '3d'), { active: 'doc:D1', beside: '3d' });
    assert.strictEqual(besidePair(s, 'doc:D1', 'doc:D2'), null);
    assert.strictEqual(besidePair(s, '3d', '3d'), null);
    assert.match(besideRefusal(s, 'doc:D1', 'doc:D2') ?? '', /dva dokumenty/);
    assert.match(besideRefusal(s, '3d', 'nie-je') ?? '', /nie je otvorená/);
    assert.strictEqual(besideRefusal(s, '3d', 'doc:D1'), null);
    // Neprípustná dvojica stav nemení.
    const active = activateTab(s, 'doc:D1');
    assert.strictEqual(setBeside(active, 'doc:D2'), active);
  });

  it('prepnutie na záložku vedľa vymení strany, "vedľa: nič" dvojicu zruší', () => {
    let s = syncDocTabs(initialTabs(), [doc('D1')], null);
    s = setBeside(activateTab(s, '3d'), 'doc:D1');
    s = activateTab(s, 'doc:D1');
    assert.deepStrictEqual([s.activeId, s.besideId], ['doc:D1', '3d']);
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

  it('rozloženie: dokument sám = 3D zbalená, vedľa = oba, 3D sama = žiadny panel dokumentu', () => {
    let s = syncDocTabs(initialTabs(), [doc('D1')], { docId: 'D1', beside: false });
    assert.deepStrictEqual(centerLayout(s), { collapse3d: true, docPane: true, docId: 'D1' });
    s = setBeside(activateTab(s, '3d'), 'doc:D1');
    assert.deepStrictEqual(centerLayout(s), { collapse3d: false, docPane: true, docId: 'D1' });
    assert.deepStrictEqual(centerLayout(setBeside(s, null)), { collapse3d: false, docPane: false, docId: null });
    assert.deepStrictEqual(centerLayout(s, true), { collapse3d: false, docPane: false, docId: null });
  });

  it('odkaz z chatu: id, menovka bez veľkosti písmen, id dokumentu', () => {
    const s = syncDocTabs(initialTabs(), [doc('D1')], null);
    assert.strictEqual(resolveTabRef(s, '3D')?.id, '3d');
    assert.strictEqual(resolveTabRef(s, 'd1.PDF')?.id, 'doc:D1');
    assert.strictEqual(resolveTabRef(s, 'D1')?.id, 'doc:D1');
    assert.strictEqual(resolveTabRef(s, 'nič'), undefined);
    assert.strictEqual(resolveTabRef(s, '  '), undefined);
  });

  it('view_state.tabs: druh, menovka, dokument, aktívna a vedľa (bez podlažia od D-161)', () => {
    const s = setBeside(syncDocTabs(initialTabs(), [doc('D1')], null), 'doc:D1');
    assert.deepStrictEqual(describeTabs(s), [
      { id: '3d', kind: '3d', label: '3D', active: true, beside: false },
      { id: 'doc:D1', kind: 'doc', label: 'D1.pdf', document_id: 'D1', active: false, beside: true },
    ]);
  });

  it('VIEW_TABS: staršie open pôdorysu a pohľadu sa ešte overia (host ich preloží), ostatné akcie bez zmeny', () => {
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

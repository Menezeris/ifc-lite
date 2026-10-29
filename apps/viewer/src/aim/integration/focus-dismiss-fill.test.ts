/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { BimContext, EntityRef } from '@ifc-lite/sdk';

import { useViewerStore, type ViewerState } from '../../store/index.js';
import { selectPickedGlobalId } from '../../components/viewer/viewport-selection.js';
import { useAimFocusRoomsStore } from '../aimFocusRoomsStore.js';
import { clearFocus, forgetFocus, installFocusDismiss, runVisibilityCommand, type VisibilityDeps } from '../visibility-commands.js';
import type { InboundMessage } from '../bridge-protocol.js';

const refOf = (guid: string): EntityRef => ({ modelId: 'm', expressId: 1000 + Number(guid.slice(1)) });

function seedModels(typeName: string): void {
  useViewerStore.setState({
    models: new Map([['m', {
      id: 'm', idOffset: 0, maxExpressId: 100_000,
      ifcDataStore: { entities: { getTypeName: () => typeName, getGlobalId: (id: number) => `G${id - 1000}` } },
    }]]) as unknown as ViewerState['models'],
    ifcDataStore: null,
  });
  useViewerStore.getState().clearEntitySelection();
}

interface Calls { colorize: unknown[][]; colorizeRgba: unknown[][]; resetColors: unknown[][] }

function fakeBim(calls: Calls): BimContext {
  return {
    viewer: {
      colorize: (...a: unknown[]) => { calls.colorize.push(a); },
      colorizeRgba: (...a: unknown[]) => { calls.colorizeRgba.push(a); },
      resetColors: (...a: unknown[]) => { calls.resetColors.push(a); },
      flyTo: () => undefined,
    },
  } as unknown as BimContext;
}

const deps: VisibilityDeps = {
  resolveGuids: (_models, guids) => guids.map(refOf),
  resolveSelector: () => [],
  selectPickedGlobalId,
  noteIssue: () => undefined,
  track: (p) => { void p.catch(() => undefined); },
  FOCUS_COLOR: '#f97316',
  FILTER_COLOR: '#ef4444',
};

type Handler = (e: unknown) => void;
type FakeDocument = Document & { fire(type: string, props: Record<string, unknown>): void };

/** Dokument len s poslucháčmi, ktoré `installFocusDismiss` registruje (bez DOM). */
function fakeDocument(): FakeDocument {
  const handlers = new Map<string, Set<Handler>>();
  return {
    addEventListener: (type: string, h: Handler) => { (handlers.get(type) ?? handlers.set(type, new Set()).get(type)!).add(h); },
    removeEventListener: (type: string, h: Handler) => { handlers.get(type)?.delete(h); },
    fire: (type: string, props: Record<string, unknown>) => { for (const h of [...(handlers.get(type) ?? [])]) h(props); },
  } as unknown as FakeDocument;
}

const msg = (m: Record<string, unknown>) => ({ source: 'aim-bridge', ...m }) as unknown as InboundMessage;

describe('zrušenie zvýraznenia FOCUS klikom a Esc (AIM #94, #164)', () => {
  beforeEach(() => {
    seedModels('IfcSpace');
    forgetFocus();
  });

  function setup() {
    const calls: Calls = { colorize: [], colorizeRgba: [], resetColors: [] };
    const bim = fakeBim(calls);
    const target = fakeDocument();
    const off = installFocusDismiss(bim, target);
    runVisibilityCommand(msg({ type: 'FOCUS', guids: ['G1', 'G2'] }), bim, deps);
    return { calls, target, off, bim };
  }
  const canvas = { tagName: 'CANVAS' };
  const fire = (target: FakeDocument, type: string, props: Record<string, unknown>) => target.fire(type, props);
  const focusedIds = () => useAimFocusRoomsStore.getState().ids.size;

  it('FOCUS na miestnosti nastaví farby aj výplň podstavy', () => {
    const { calls, off } = setup();
    assert.equal(calls.colorizeRgba.length, 1);
    assert.equal(focusedIds(), 2);
    off();
  });

  it('klik na plátno bez ťahania zruší farby aj výplň miestnosti', () => {
    const { calls, target, off } = setup();
    fire(target, 'pointerdown', { target: canvas, clientX: 10, clientY: 10 });
    fire(target, 'pointerup', { target: canvas, clientX: 11, clientY: 10 });
    assert.equal(calls.resetColors.length > 0, true, 'farby sa vrátia');
    assert.equal(focusedIds(), 0, 'oranžová výplň podstavy zmizne');
    off();
  });

  it('ťah kamerou zvýraznenie nezruší', () => {
    const { calls, target, off } = setup();
    fire(target, 'pointerdown', { target: canvas, clientX: 10, clientY: 10 });
    fire(target, 'pointerup', { target: canvas, clientX: 80, clientY: 40 });
    assert.equal(calls.resetColors.length, 0);
    assert.equal(focusedIds(), 2);
    off();
  });

  it('Esc zruší farby aj výplň, ale nie v textovom poli', () => {
    const { calls, target, off } = setup();
    fire(target, 'keydown', { key: 'Escape', target: { tagName: 'INPUT', isContentEditable: false } });
    assert.equal(focusedIds(), 2, 'v textovom poli Esc patrí úprave textu');
    fire(target, 'keydown', { key: 'Escape', target: { tagName: 'DIV', isContentEditable: false } });
    assert.equal(calls.resetColors.length > 0, true);
    assert.equal(focusedIds(), 0);
    off();
  });

  it('CLEAR_FOCUS, SELECT a RESET_COLORS rušia aj výplň', () => {
    for (const m of [{ type: 'CLEAR_FOCUS' }, { type: 'RESET_COLORS' }, { type: 'SELECT', guid: 'G5' }]) {
      const { off, bim } = setup();
      assert.equal(focusedIds(), 2);
      runVisibilityCommand(msg(m), bim, deps);
      assert.equal(focusedIds(), 0, `${m.type} nezrušil výplň`);
      off();
    }
  });

  it('RESET_COLORS zruší aj izoláciu, CLEAR_FILTER a CLEAR_FOCUS ju nechajú; skrytie ostáva (AIM #298)', () => {
    for (const [type, cleared] of [['RESET_COLORS', true], ['CLEAR_FILTER', false], ['CLEAR_FOCUS', false]] as const) {
      const { off, bim } = setup();
      useViewerStore.setState({ isolatedEntities: new Set([1001, 1002]), hiddenEntities: new Set([1005]) });
      runVisibilityCommand(msg({ type }), bim, deps);
      assert.equal(useViewerStore.getState().isolatedEntities === null, cleared, `${type}: izolácia`);
      assert.deepEqual([...useViewerStore.getState().hiddenEntities], [1005], `${type}: skrytie ostáva`);
      off();
    }
    useViewerStore.setState({ isolatedEntities: null, hiddenEntities: new Set() });
  });

  it('clearFocus bez zvýraznenia je bezpečný', () => {
    const calls: Calls = { colorize: [], colorizeRgba: [], resetColors: [] };
    clearFocus(fakeBim(calls));
    assert.equal(calls.resetColors.length, 0);
  });
});

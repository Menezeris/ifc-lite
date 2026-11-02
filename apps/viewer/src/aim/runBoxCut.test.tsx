/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** "Box cut" v kontextovom menu prvku: klik spraví box okolo kliknutého prvku (nie okolo starého výberu). */

import '@/test/setup-dom.js';
import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useViewerStore } from '@/store/index.js';
import { EntityContextMenu } from '@/components/viewer/EntityContextMenu.js';
import { SPACE, WALL_L, seedBoxCutModel } from './sectionBoxScene.test-support.js';

const mounted: Array<{ root: Root; container: HTMLElement }> = [];
function unmountAll(): void {
  for (const { root, container } of mounted.splice(0)) { act(() => root.unmount()); container.remove(); }
}
after(unmountAll);

function openMenuFor(id: number): HTMLElement {
  act(() => { useViewerStore.getState().openContextMenu(id, 10, 10); });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<EntityContextMenu />); });
  mounted.push({ root, container });
  return container;
}
const boxCutButton = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('button[data-command-id="aim:box-cut"]');

beforeEach(async () => {
  unmountAll();
  await seedBoxCutModel();
  // A stale selection elsewhere: the box must follow the right-clicked element.
  useViewerStore.setState({ selectedEntityId: WALL_L, selectedEntityIds: new Set([WALL_L]) });
});

describe('Box cut v kontextovom menu prvku', () => {
  it('miestnosť: klik pridá box od podlahy po strop vrátane stien a zatvorí menu', () => {
    const btn = boxCutButton(openMenuFor(SPACE));
    assert.ok(btn, 'položka Box cut v menu prvku');
    assert.equal(btn.textContent?.trim(), 'Box cut');
    act(() => { btn.click(); });
    const box = useViewerStore.getState().sectionPlane.box;
    assert.ok(box);
    assert.ok(Math.abs(box.min[1] + 0.25) < 1e-5 && Math.abs(box.max[1] - 2.95) < 1e-5);
    assert.equal(useViewerStore.getState().contextMenu.isOpen, false);
  });

  it('bez geometrie prvku box nevznikne', () => {
    const btn = boxCutButton(openMenuFor(9999));
    assert.ok(btn);
    act(() => { btn.click(); });
    assert.equal(useViewerStore.getState().sectionPlane.box ?? null, null);
  });
});

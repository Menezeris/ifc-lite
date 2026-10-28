/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Widget rezu a rezný box z chatu (AIMviewer#322): `set_section` so `show_widget=false`
 * si hosť pamätá ako poslednú voľbu widgetu a `SET_SECTION_BOX` ju musí dodržať,
 * inak sa steny a rukoväte boxu zobrazia, hoci `view_state` hlási `show_gizmo: false`.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup } from '@/test/render.js';
import { useViewerStore } from '@/store';
import { getDefaultSectionPlane } from '@/store/slices/sectionSlice.js';
import { applyGizmo, runSectionBox } from './useAimViewCommands.js';
import { settled, takeIssues, resetCommandState } from './command-gate.js';
import { SOURCE } from './bridge-protocol.js';
import { renderScene } from '@/components/viewport-ui/scene/test/scene-test-support.js';
import { SectionBoxVisualization } from '@/components/viewer/tools/SectionBoxVisualization.js';

const s = () => useViewerStore.getState();
const BOX = { source: SOURCE, type: 'SET_SECTION_BOX', box: { min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 3, z: 2 } } };

beforeEach(() => {
  useViewerStore.setState({ sectionPlane: getDefaultSectionPlane(), inactiveSectionPlanes: [] });
});
afterEach(() => {
  cleanup();
  applyGizmo(true);
  resetCommandState();
});

describe('rezný box a widget rezu (AIMviewer#322)', () => {
  it('box po skrytom widgete ostane bez widgetu a stav to hlási pravdivo', async () => {
    applyGizmo(false);
    // Používateľ vyčistil rez v paneli: nová rovina je znova so zobrazeným widgetom, voľba hosta platí ďalej.
    useViewerStore.setState({ sectionPlane: getDefaultSectionPlane(), inactiveSectionPlanes: [] });
    assert.equal(s().sectionPlane.showGizmo, true);
    runSectionBox(BOX);
    assert.equal(await settled(5000), true);
    assert.deepEqual(takeIssues(), []);
    assert.ok(s().sectionPlane.box, 'box je nastavený');
    assert.equal(s().sectionPlane.showGizmo, false);
  });

  it('bez voľby od hosta box zachová predvolený widget', async () => {
    resetCommandState();
    runSectionBox(BOX);
    assert.equal(await settled(5000), true);
    assert.equal(s().sectionPlane.showGizmo, true);
  });

  it('steny a rukoväte boxu sa nekreslia, kým je widget skrytý; rez ostáva a widget sa dá vrátiť', () => {
    act(() => s().setSectionBox({ min: [2, 1, 0], max: [12, 5, 8] }));
    act(() => s().setSectionPlaneShowGizmo(s().sectionPlane.id, false));
    const { container, source, flush } = renderScene(<SectionBoxVisualization />);
    source.dirty = true;
    flush();
    assert.equal(container.querySelectorAll('[data-scene-primitive]').length, 0, 'z widgetu nie je na scéne nič');
    assert.equal(s().sectionPlane.enabled, true);
    assert.deepEqual(s().sectionPlane.box, { min: [2, 1, 0], max: [12, 5, 8] }, 'rez samotný ostáva');
    act(() => s().setSectionPlaneShowGizmo(s().sectionPlane.id, true));
    flush();
    assert.equal(container.querySelectorAll('[data-scene-primitive="handle"]').length, 6, 'na požiadanie sa vráti');
  });
});

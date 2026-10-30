/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { useViewerStore } from '@/store';
import { useAimUnderlays3d } from '../aimUnderlays3d.js';
import { queryViewState, type GuidHelpers } from '../viewQueries.js';

const g = { sectionRenderBounds: () => null } as unknown as GuidHelpers;
const reported = () => queryViewState(useViewerStore.getState(), g).underlays_3d;

afterEach(() => {
  useAimUnderlays3d.setState({ hidden: true });
  useViewerStore.setState({ underlayViewLocked: false });
});

describe('view_state.underlays_3d (AIM #280 doplnok)', () => {
  it('vypnuté podklady v 3D hlási false, zapnuté true', () => {
    useAimUnderlays3d.setState({ hidden: true });
    assert.equal(reported(), false);
    useAimUnderlays3d.setState({ hidden: false });
    assert.equal(reported(), true);
  });

  it('zamknutý pôdorysný pohľad podklady ukazuje aj pri vypínači Off, ako panel', () => {
    useAimUnderlays3d.setState({ hidden: true });
    useViewerStore.setState({ underlayViewLocked: true });
    assert.equal(reported(), true);
  });
});

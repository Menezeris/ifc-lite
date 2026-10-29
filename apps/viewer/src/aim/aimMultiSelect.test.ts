/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { useViewerStore, type ViewerState } from '../store/index.js';
import { toggleGlobalIdInSelection } from '../components/viewer/viewport-selection.js';
import { addGlobalIdsToSelection, planAddToSelection } from './aimMultiSelect.js';
import type { EntityRef } from '../store/types.js';

const COUNT = 300;
const IDS = Array.from({ length: COUNT }, (_, i) => 1000 + i);

function seed(): void {
  useViewerStore.setState({
    models: new Map([['m', { id: 'm', idOffset: 0, maxExpressId: 100_000, ifcDataStore: null }]]) as unknown as ViewerState['models'],
    ifcDataStore: null,
  });
  useViewerStore.getState().clearEntitySelection();
  // Prvý prvok ako SELECT: klik na jeden prvok, ostatné pridá host naraz.
  useViewerStore.getState().setSelectedEntityId(IDS[0]);
  useViewerStore.getState().setSelectedEntity({ modelId: 'm', expressId: IDS[0] });
}

function snapshot() {
  const s = useViewerStore.getState();
  return {
    entities: [...s.selectedEntitiesSet].sort(),
    ids: [...s.selectedEntityIds].sort((a, b) => a - b),
    id: s.selectedEntityId,
    entity: s.selectedEntity,
  };
}

describe('viacnásobný SELECT jedným zápisom (AIM #273)', () => {
  beforeEach(seed);

  it('výsledný výber je rovnaký ako po rade Ctrl+klikov', () => {
    for (const id of IDS.slice(1)) toggleGlobalIdInSelection(id);
    const viaClicks = snapshot();
    seed();
    addGlobalIdsToSelection(IDS.slice(1));
    assert.deepEqual(snapshot(), viaClicks);
    assert.equal(snapshot().ids.length, COUNT);
  });

  it('pridanie je jeden zápis do store, nie N', () => {
    let writes = 0;
    const off = useViewerStore.subscribe(() => { writes++; });
    addGlobalIdsToSelection(IDS.slice(1));
    off();
    assert.equal(writes, 1, `rad Ctrl+klikov budil store ${COUNT - 1} x 4`);
  });

  it('prvok, ktorý už je vo výbere, ostane (zjednotenie, nie prepínač)', () => {
    addGlobalIdsToSelection([IDS[1], IDS[2]]);
    addGlobalIdsToSelection([IDS[2], IDS[3]]);
    assert.deepEqual(snapshot().ids, IDS.slice(0, 4));
  });

  it('prázdny zoznam nič nezmení a vráti null', () => {
    const resolve = (id: number): EntityRef => ({ modelId: 'm', expressId: id });
    const s = useViewerStore.getState();
    assert.equal(planAddToSelection(s, [], resolve), null);
    const before = s.selectionRevision;
    addGlobalIdsToSelection([]);
    assert.equal(useViewerStore.getState().selectionRevision, before);
  });
});

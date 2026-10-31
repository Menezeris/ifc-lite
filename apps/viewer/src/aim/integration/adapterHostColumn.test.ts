/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */


/**
 * `host` column wiring (AIM D-174, #277): the provider of the Lists panel answers `getHostValue`
 * from the values the host sent, looked up by the element's GlobalId.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { IfcDataStore } from '@ifc-lite/parser';
import { clearHostColumns, setHostColumn } from '@/aim/aimHostColumns';
import { createListDataProvider } from '@/lib/lists/adapter';

const store = { entities: { getGlobalId: (id: number) => `guid-${id}` } } as unknown as IfcDataStore;

describe('createListDataProvider: getHostValue (D-174)', () => {
  it('returns the host text for the GlobalId of the element, undefined otherwise', () => {
    clearHostColumns();
    setHostColumn('space_derived', { 'guid-7': 'Izba A' });
    const provider = createListDataProvider(store);
    assert.equal(provider.getHostValue?.(7, 'space_derived'), 'Izba A');
    assert.equal(provider.getHostValue?.(8, 'space_derived'), undefined);
    assert.equal(provider.getHostValue?.(7, 'unknown'), undefined);
    clearHostColumns();
  });
});

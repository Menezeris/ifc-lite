/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `SELECT` s `panel.focus` nad skutočným `PropertiesPanel` (AIM #168): zvýraznená vlastnosť ostane
 * označená do ďalšieho výberu, aj keď sa vlastnosti prvku dotiahnu až po výbere (veľký model:
 * loader najprv zverejní čiastočný store bez tabuľky vlastností, plný príde o sekundy neskôr).
 * Predtým hľadanie po 0,9 s preklopilo sekciu a po 1,8 s to vzdalo ("vlastnosť na prvku nie je"),
 * hoci vlastnosť o chvíľu na paneli bola.
 */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { advance, cleanup, render, waitFor } from '@/test/render.js';
import { useViewerStore } from '@/store';
import { parseStep, seedModel } from '@/test/properties-panel-harness.js';
import { PropertiesPanel } from '@/components/viewer/PropertiesPanel.js';
import type { IfcDataStore } from '@ifc-lite/parser';
import { applyPanelView } from './aimPanelView.js';

const MODEL_ID = 'm1';
const ID_OFFSET = 1_000_000;
const WALL = 72;
const guid = (mnemonic: string): string => (mnemonic + '0'.repeat(22)).slice(0, 22);

// Wall #72 carries two custom psets from the file (Custom_A: A1, A2 and
// Custom_B: B1). Its type #90 owns Custom_T (T1, T2) through HasPropertySets.
const MODEL = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''),'2;1');
FILE_NAME('m','2026',(''),(''),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1= IFCPROJECT('${guid('PROJ')}',$,'Proj',$,$,$,$,(#20),#30);
#20= IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,#21,$);
#21= IFCAXIS2PLACEMENT3D(#22,$,$);
#22= IFCCARTESIANPOINT((0.,0.,0.));
#30= IFCUNITASSIGNMENT((#31));
#31= IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#40= IFCLOCALPLACEMENT($,#21);
#41= IFCBUILDINGSTOREY('${guid('STOR')}',$,'L01',$,$,#40,$,$,.ELEMENT.,0.);
#42= IFCBUILDING('${guid('BLDG')}',$,'B',$,$,#40,$,$,.ELEMENT.,$,$,$);
#43= IFCRELAGGREGATES('${guid('AGG1')}',$,$,$,#1,(#42));
#44= IFCRELAGGREGATES('${guid('AGG2')}',$,$,$,#42,(#41));
#45= IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid('RELC')}',$,$,$,(#72),#41);
#72= IFCWALL('${guid('WALA')}',$,'Wall A',$,$,#40,$,'tagA',$);
#81= IFCPROPERTYSINGLEVALUE('A1',$,IFCLABEL('a1'),$);
#82= IFCPROPERTYSINGLEVALUE('A2',$,IFCLABEL('a2'),$);
#80= IFCPROPERTYSET('${guid('PSA')}',$,'Custom_A',$,(#81,#82));
#83= IFCRELDEFINESBYPROPERTIES('${guid('RDA')}',$,$,$,(#72),#80);
#85= IFCPROPERTYSINGLEVALUE('B1',$,IFCLABEL('b1'),$);
#84= IFCPROPERTYSET('${guid('PSB')}',$,'Custom_B',$,(#85));
#86= IFCRELDEFINESBYPROPERTIES('${guid('RDB')}',$,$,$,(#72),#84);
#90= IFCWALLTYPE('${guid('WTYP')}',$,'WT',$,$,(#91),$,$,$,.STANDARD.);
#92= IFCPROPERTYSINGLEVALUE('T1',$,IFCLABEL('t1'),$);
#93= IFCPROPERTYSINGLEVALUE('T2',$,IFCLABEL('t2'),$);
#91= IFCPROPERTYSET('${guid('PST')}',$,'Custom_T',$,(#92,#93));
#94= IFCRELDEFINESBYTYPE('${guid('RDT')}',$,$,$,(#72),#90);
ENDSEC;
END-ISO-10303-21;
`;


async function parseLikeTheLoader(): Promise<{ partial: IfcDataStore; full: IfcDataStore }> {
  let partial: IfcDataStore | null = null;
  const full = await parseStep(MODEL, (p) => { partial = p; });
  assert.ok(partial, 'the parser must publish a spatial-ready partial store');
  return { partial, full };
}

const marked = () => [...document.querySelectorAll('[data-aim-focus]')].map((e) => e.getAttribute('data-prop-key'));
const target = { modelId: MODEL_ID, expressId: WALL };

let initialState: ReturnType<typeof useViewerStore.getState>;

describe('zvýraznená vlastnosť z chatu (AIM #168)', () => {
  afterEach(() => {
    cleanup();
    if (initialState) useViewerStore.setState(initialState, true);
  });

  for (const [pset, prop, row] of [['Custom_B', 'B1', '72:Custom_B:B1'], ['Custom_T', 'T2', '90:Custom_T:T2']] as const) {
    it(`${pset}.${prop}: zbalená sada sa rozbalí a označenie drží ďalšie sekundy`, async () => {
      initialState ??= useViewerStore.getState();
      const { full } = await parseLikeTheLoader();
      seedModel(MODEL_ID, ID_OFFSET, full, WALL);
      render(<PropertiesPanel />);
      await advance(0);
      const issues: string[] = [];
      const done = applyPanelView({ section: 'properties', focus: { pset, property: prop } }, target, (t) => issues.push(t));
      await waitFor(() => marked().length === 1, 'riadok sa označí');
      await done;
      await advance(2500);
      assert.deepEqual(marked(), [row]);
      assert.deepEqual(issues, []);
    });
  }

  it('vlastnosti prídu až po 1,5 s: označenie sa objaví a ostane, hlásenie "nie je" nepríde', async () => {
    initialState ??= useViewerStore.getState();
    const { partial, full } = await parseLikeTheLoader();
    seedModel(MODEL_ID, ID_OFFSET, partial, WALL);
    useViewerStore.setState({ loading: true }); // loader ešte beží, plný store príde neskôr
    render(<PropertiesPanel />);
    await advance(0);
    const issues: string[] = [];
    void applyPanelView({ section: 'properties', focus: { pset: 'Custom_B', property: 'B1' } }, target, (t) => issues.push(t));
    await advance(1500);
    useViewerStore.getState().setIfcDataStore(full);
    await waitFor(() => marked().length === 1, 'riadok sa označí po načítaní vlastností', 4000);
    await advance(2500);
    assert.deepEqual(marked(), ['72:Custom_B:B1']);
    assert.equal(useViewerStore.getState().propertiesActiveTab, 'properties');
    assert.deepEqual(issues, []);
  });

  it('vlastnosť, ktorá na prvku nie je, sa ohlási a označenie nevznikne', async () => {
    initialState ??= useViewerStore.getState();
    const { full } = await parseLikeTheLoader();
    seedModel(MODEL_ID, ID_OFFSET, full, WALL);
    render(<PropertiesPanel />);
    await advance(0);
    const issues: string[] = [];
    await applyPanelView({ section: 'properties', focus: { pset: 'Custom_B', property: 'Neexistuje' } }, target, (t) => issues.push(t));
    assert.deepEqual(marked(), []);
    assert.match(issues[0] ?? '', /vlastnosť Custom_B\.Neexistuje na prvku v IFC paneli nie je/);
  });

  it('loader dobehol a store nemá žiadne vlastnosti: skončí hneď s "nie je", nie po 10 s s "nenačítali" (follow-up #176)', async () => {
    initialState ??= useViewerStore.getState();
    const { partial } = await parseLikeTheLoader(); // bez tabuľky vlastností, ako model bez psetov
    seedModel(MODEL_ID, ID_OFFSET, partial, WALL);
    useViewerStore.setState({ loading: false });
    render(<PropertiesPanel />);
    await advance(0);
    const issues: string[] = [];
    let settled = false;
    void applyPanelView({ section: 'properties', focus: { pset: 'Custom_B', property: 'B1' } }, target, (t) => issues.push(t)).then(() => { settled = true; });
    await advance(600);
    assert.equal(settled, true, 'nečaká na LOAD_PATIENCE_MS');
    assert.equal(issues.length, 1);
    assert.match(issues[0], /vlastnosť Custom_B\.B1 na prvku v IFC paneli nie je/);
    assert.doesNotMatch(issues[0], /nenačítali/);
  });
});

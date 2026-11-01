/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Klik na tému v zozname (AIM #199, bod 3), väzba na store: 3D pohľad témy cez
 * upstream `applyViewpoint` (odovzdá panel BCF), alebo strana dokumentu s
 * výrezom ako `DOCUMENT_OPEN` z mosta (karta, záložka, výrez). Modul je v
 * lenivom chunku zoznamu, nie vo vstupe.
 */

import type { BCFTopic, BCFViewpoint } from '@ifc-lite/bcf';
import { useViewerStore } from '../store/index.js';
import { useAimViewTabs, withTabs } from './viewTabsStore.js';
import { useAimDocRegionStore } from './docRegion.js';
import { topicOpenAction } from './topicListModel.js';

/** Otvorí kontext témy; false = téma nemá 3D pohľad ani odkaz na dokument. */
export function openTopicContext(topic: BCFTopic, applyViewpoint: (vp: BCFViewpoint) => void): boolean {
  const action = topicOpenAction(topic);
  if (!action) return false;
  if (action.kind === '3d') {
    const vp = topic.viewpoints.find((v) => v.guid === action.viewpointGuid);
    if (!vp) return false;
    // Z karty dokumentu späť na 3D, inak by sa kamera pohla pod otvoreným PDF.
    withTabs((m) => m.activate(useAimViewTabs.getState().sceneId));
    applyViewpoint(vp);
    return true;
  }
  const { docId, page, region } = action.target;
  if (!useViewerStore.getState().viewerDocuments.has(docId)) return false;
  useAimViewTabs.setState({ bridgeDocId: docId });
  useViewerStore.getState().openDocument(docId, { page });
  void withTabs((m) => m.showDoc(docId, 'tab'));
  if (region) useAimDocRegionStore.getState().requestRegion(docId, region, page);
  return true;
}

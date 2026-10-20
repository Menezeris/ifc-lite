/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Zoznam z chatu vo vieweri (AIM D-111): `OPEN_LIST` odovzdá upstream panelu
 * Lists návrh zoznamu (`pendingListDraft`), tou istou cestou ako "Create list"
 * z vyhľadávania. Builder sa otvorí s filtrami a stĺpcami; spustenie a export
 * (CSV/XLSX/PDF) urobí používateľ v paneli. Načítava sa lenivo pri prvej správe.
 */

import { useViewerStore } from '@/store';
import { listDefinitionFromChat, parseOpenList } from './aimListPlan.js';
import type { LensInboundMessage } from './lens-protocol.js';
import { noteIssue } from './command-gate.js';

export function openListFromChat(data: LensInboundMessage): void {
  const msg = parseOpenList(data);
  if (!msg) {
    noteIssue('Zoznam: viewer správu odmietol (neplatné filtre alebo stĺpce)');
    return;
  }
  const state = useViewerStore.getState();
  const models = [...state.models.values()].map((m) => ({ name: m.name, fingerprint: m.sourceFingerprint }));
  state.setPendingListDraft(listDefinitionFromChat(msg, models, crypto.randomUUID(), Date.now()));
  state.setListPanelVisible(true);
}

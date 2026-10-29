/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Zoznam z chatu vo vieweri (AIM D-111): `OPEN_LIST` odovzdá upstream panelu
 * Lists návrh zoznamu (`pendingListDraft`), tou istou cestou ako "Create list"
 * z vyhľadávania. Builder sa otvorí s filtrami a stĺpcami; spustenie a export
 * (CSV/XLSX/PDF) urobí používateľ v paneli; s `run` (D-148) sa tabuľka spustí sama, `view` a
 * `LIST_UPDATE` (D-149) ju upravia. Načítava sa lenivo pri prvej správe.
 */

import { useViewerStore } from '@/store';
import { listDefinitionFromChat, parseOpenList } from './aimListPlan.js';
import type { LensInboundMessage } from './lens-protocol.js';
import { noteIssue } from './command-gate.js';
import { noteListOpened, resetListRun, settledListSummary } from './aimListRun.js';
import { applyListView, settleListView, updateListFromChat } from './aimListControl.js';
import { describeList } from './aimListState.js';
import { parseListView } from './aimListViewPlan.js';
import { resetListView, setListHighlight } from './aimListViewStore.js';

export function openListFromChat(data: LensInboundMessage): void {
  const msg = parseOpenList(data);
  if (!msg) {
    noteIssue('Zoznam: viewer správu odmietol (neplatné filtre alebo stĺpce)');
    return;
  }
  const state = useViewerStore.getState();
  const models = [...state.models.values()].map((m) => ({ name: m.name, fingerprint: m.sourceFingerprint }));
  // Zoskupenie, súčty, zoradenie a maximalizácia z `view` (D-149); `parseOpenList` ho už overil.
  // Nový zoznam (#276, #274): zvýraznenie predošlého zoznamu zmizne a pri izolácii v 3D sa tabuľka nezúži na jej riadky.
  // Izoláciu v 3D neruším (je to pohľad používateľa), len filter "len viditeľné" v tabuľke sa vypne; `view.visibleOnly` ho prebije.
  const view = parseListView(msg.view) ?? {};
  setListHighlight(null);
  if (view.visibleOnly === undefined && state.isolatedEntities !== null) view.visibleOnly = false;
  const definition = applyListView(listDefinitionFromChat(msg, models, crypto.randomUUID(), Date.now()), view);
  noteListOpened(definition, msg.run === true); // s `run` tabuľku po zobrazení panela spustí hook (D-148)
  state.setPendingListDraft(definition);
  state.setListPanelVisible(true);
}

export { updateListFromChat };

/** Súhrn behu zoznamu z chatu pre `APPLIED` (D-148) so stavom tabuľky (D-149). */
export async function listSummary(timeoutMs: number): Promise<Record<string, unknown> | null> {
  const run = await settledListSummary(timeoutMs);
  if (!run) return null;
  await settleListView(timeoutMs);
  return { ...describeList(), ...run };
}

export function resetListFromChat(): void {
  resetListRun();
  resetListView();
}

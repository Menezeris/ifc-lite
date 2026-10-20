/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Panel vlastností z chatu (AIM D-113): `SELECT` s `panel` po výbere prepne
 * záložku AIM | IFC, sekciu upstream panela (Properties | Quantities) a
 * zvýrazní vlastnosť tou istou cestou ako skok z bSDD karty
 * (`pendingPropertyFocus`: rozbalí pset, posunie a zvýrazní riadok), len bez
 * režimu úprav. Validácia a plán sú v `aimPanelViewPlan.ts`; tu sa čaká, kým
 * sa výber prejaví v store, lebo panel pri zmene výberu focus zahadzuje.
 */

import { useViewerStore } from '../store/index.js';
import { markReadOnlyFocus, useAimInspectorStore } from './aimInspectorStore.js';
import { panelPlan, type AimPanelView } from './aimPanelViewPlan.js';

const SETTLE_TIMEOUT_MS = 5000;

/**
 * Po výbere prvku `modelId:expressId` nastaví záložku, sekciu a focus.
 * Focus ide až o dva snímky po tom, čo store nesie nový výber: efekt panela
 * pri zmene výberu `pendingPropertyFocus` zahadzuje.
 */
export function applyPanelView(view: AimPanelView, target: { modelId: string; expressId: number }, noteIssue: (text: string) => void): Promise<void> {
  const plan = panelPlan(view);
  const store = useViewerStore;
  if (plan.tab) useAimInspectorStore.getState().setTab(plan.tab);
  if (plan.section) store.getState().setPropertiesActiveTab(plan.section);
  const focus = plan.focus;
  if (!focus) return Promise.resolve();
  const matches = () => {
    const sel = store.getState().selectedEntity;
    return !!sel && sel.modelId === target.modelId && sel.expressId === target.expressId;
  };
  return new Promise<void>((resolve) => {
    const arm = () => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const sel = store.getState().selectedEntity;
          if (sel) {
            store.getState().setPendingPropertyFocus(
              markReadOnlyFocus({ modelId: sel.modelId, entityId: sel.expressId, psetName: focus.pset, propName: focus.property }),
            );
          }
          resolve();
        }),
      );
    };
    if (matches()) return arm();
    const timer = setTimeout(() => {
      unsubscribe();
      noteIssue('SELECT: panel vlastností sa nezmenil, výber sa neprejavil');
      resolve();
    }, SETTLE_TIMEOUT_MS);
    const unsubscribe = store.subscribe(() => {
      if (!matches()) return;
      clearTimeout(timer);
      unsubscribe();
      arm();
    });
  });
}

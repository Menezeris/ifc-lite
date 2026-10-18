/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AIM derivations layer state (D-089 phase B) - the layer pushed by the AIM
 * host over the aim-bridge (AIM_DERIVATIONS_LOAD) plus the viewer-local view
 * toggles. A standalone zustand store like aimDecorationsStore: everything AIM
 * lives under src/aim (D-071).
 *
 * The eye toggles and the open AIM LAYERS section are local view state only;
 * nothing here is ever posted back. Enabling a rule is a data change made at
 * `layer.manageUrl` (viewer-side writes come in phase 3).
 */

import { create } from 'zustand';

import type { DerivationsLayerWire } from './bridge-protocol.js';

interface AimDerivationsState {
  /** The layer; null = the host sent none (standalone or older host). */
  layer: DerivationsLayerWire | null;
  /** Global eye: show derived relations in the Relationship records. */
  relationsVisible: boolean;
  /** Per-rule eye: rule ids whose relations are hidden. */
  hiddenRuleIds: string[];
  /** The AIM LAYERS section in the tree panel is expanded. */
  layersOpen: boolean;
  setLayer: (layer: DerivationsLayerWire) => void;
  toggleRelationsVisible: () => void;
  toggleRuleVisible: (ruleId: string) => void;
  setLayersOpen: (open: boolean) => void;
  clear: () => void;
}

export const useAimDerivationsStore = create<AimDerivationsState>((set) => ({
  layer: null,
  relationsVisible: true,
  hiddenRuleIds: [],
  layersOpen: true,
  // A re-push (new revision, changed rule) keeps the local toggles; ids of
  // rules the host no longer sends are dropped so they cannot linger hidden.
  setLayer: (layer) =>
    set((s) => {
      const ids = new Set(layer.rules.map((r) => r.id));
      return { layer, hiddenRuleIds: s.hiddenRuleIds.filter((id) => ids.has(id)) };
    }),
  toggleRelationsVisible: () => set((s) => ({ relationsVisible: !s.relationsVisible })),
  toggleRuleVisible: (ruleId) =>
    set((s) => ({
      hiddenRuleIds: s.hiddenRuleIds.includes(ruleId)
        ? s.hiddenRuleIds.filter((id) => id !== ruleId)
        : [...s.hiddenRuleIds, ruleId],
    })),
  setLayersOpen: (layersOpen) => set({ layersOpen }),
  // Teardown (bridge unmount): back to the initial state, local toggles included.
  clear: () => set({ layer: null, relationsVisible: true, hiddenRuleIds: [], layersOpen: true }),
}));

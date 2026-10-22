/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AIM panel state — DB-side data for the selected entity, pushed by the AIM
 * host over the aim-bridge (AIM_PANEL_DATA / AIM_PANEL_EMPTY). A standalone
 * zustand store, deliberately NOT a slice in src/store: everything AIM lives
 * under src/aim so upstream rebases touch zero shared files.
 *
 * The payload is a host-driven render schema: the host decides labels, rows,
 * sections and links. Since AIM D-129 there is no AIM card: the AIM layer rows
 * (AimInspectorTabs.tsx), Relationship records and the Documents panel read it.
 */

import { create } from 'zustand';

import type { AimPanelData, OutboundMessage } from './bridge-protocol.js';
import { SOURCE } from './bridge-core.js';

export type { AimPanelData };

export type AimPanelState =
  | { status: 'idle' }
  | { status: 'loading'; guid: string }
  | { status: 'ready'; guid: string; data: AimPanelData }
  | { status: 'empty'; guid: string; reason: string };

interface AimPanelStore {
  /** True when running inside the AIM host iframe (set once by AimBridge). */
  embedded: boolean;
  /** Trusted parent origin for AIM_NAVIGATE posts (set once by AimBridge). */
  parentOrigin: string | null;
  panel: AimPanelState;
  setEmbedded: (embedded: boolean, parentOrigin: string | null) => void;
  /** New selection — enter loading and arm the no-answer timeout. */
  beginLoading: (guid: string) => void;
  /** Host answered. Ignored unless `guid` matches the current selection. */
  resolve: (guid: string, next: { data: AimPanelData } | { reason: string }) => void;
  clear: () => void;
}

/** Old host / dead network never answers — degrade loading → quiet empty. */
const LOADING_TIMEOUT_MS = 10_000;
let loadingTimer: ReturnType<typeof setTimeout> | undefined;

export const useAimPanelStore = create<AimPanelStore>((set, get) => ({
  embedded: false,
  parentOrigin: null,
  panel: { status: 'idle' },

  setEmbedded: (embedded, parentOrigin) => set({ embedded, parentOrigin }),

  beginLoading: (guid) => {
    clearTimeout(loadingTimer);
    loadingTimer = setTimeout(() => {
      const { panel } = get();
      if (panel.status === 'loading' && panel.guid === guid) {
        set({ panel: { status: 'empty', guid, reason: 'timeout' } });
      }
    }, LOADING_TIMEOUT_MS);
    set({ panel: { status: 'loading', guid } });
  },

  resolve: (guid, next) => {
    const { panel } = get();
    if (panel.status === 'idle' || panel.guid !== guid) return; // stale response
    clearTimeout(loadingTimer);
    set({
      panel:
        'data' in next
          ? { status: 'ready', guid, data: next.data }
          : { status: 'empty', guid, reason: next.reason },
    });
  },

  clear: () => {
    clearTimeout(loadingTimer);
    set({ panel: { status: 'idle' } });
  },
}));

/**
 * Viewer -> host: "Ukázať v 3D" on an open document (D-104 step 4 in the AIM
 * repo). The host resolves the elements the page (or the whole document) refers
 * to from its graph and answers with APPLY_LENS; the viewer holds no document
 * links. Declared here, not in bridge-protocol.ts, which sits at its
 * module-size budget.
 */
export type DocumentShow3dMessage = { source: typeof SOURCE; type: 'DOCUMENT_SHOW_3D'; documentId: string; page?: number };

export function postAimDocumentShow3d(target: { documentId: string; page?: number }) {
  const { parentOrigin } = useAimPanelStore.getState();
  window.parent.postMessage(
    { source: SOURCE, type: 'DOCUMENT_SHOW_3D', ...target } satisfies DocumentShow3dMessage,
    parentOrigin ?? '*',
  );
}

/** Click on any AIM link — the parent app navigates; the iframe never does. */
export function postAimNavigate(href: string) {
  const { parentOrigin } = useAimPanelStore.getState();
  window.parent.postMessage(
    { source: SOURCE, type: 'AIM_NAVIGATE', href } satisfies OutboundMessage,
    parentOrigin ?? '*',
  );
}

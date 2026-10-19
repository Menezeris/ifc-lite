/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Vykonanie bridge správ pohľadu (AIM D-083 fáza 1) cez existujúce cesty
 * viewera: rez cez `showSectionCut`/`clearSectionCut` (tá istá cesta ako SDK
 * `setSection` a BCF viewpoint, Section tool ho ukáže a dá sa posúvať),
 * kamera cez `cameraCallbacks` + `bim.viewer.flyTo` (lenivo `viewCamera.ts`, D-098), režim cez `useViewMode`
 * (prepínač 3D|2D|Split, D-075). Vracia ref, aby ho listener v AimBridge
 * mohol volať bez re-registrácie. `QUERY` (AIM D-085) odpovedá rodičovi na `origin`.
 */

import { useEffect, useRef } from 'react';
import { useViewerStore } from '@/store';
import { clearSectionCut, showSectionCut } from '@/store/section-active';
import { sectionAxisRange } from '@/lib/section/section-distance';
import { totalYupOffset } from '@/lib/geo/coordinate-frame';
import { useViewMode } from '@/hooks/useViewMode';
import type { BimContext } from '@ifc-lite/sdk';
import { guidForEntity, resolveGuids, resolveSelector } from './bridge-protocol.js';
import type { ViewInboundMessage } from './view-protocol.js';
import { VIEWER_AXIS, cameraStep, pickStorey, storeyCutPercent } from './viewCommands.js';
import { placementCoordinateInfo } from '@/lib/section/placement-coordinate-info';
import { sectionRenderBounds as sectionBoundsWith } from './sectionRange.js';

/** D-085 (obálky, stav, rez cez prvok) sa načíta až pri prvom použití - mimo vstupného balíka. */
let queries: Promise<typeof import('./viewQueries.js')> | null = null;
const loadQueries = () => (queries ??= import('./viewQueries.js'));
/** Obálka, voči ktorej renderer reže (#63). */
const sectionRenderBounds = (state: Parameters<typeof sectionBoundsWith>[0]) => sectionBoundsWith(state, placementCoordinateInfo);
const GUIDS = { resolveGuids, guidForEntity, sectionRenderBounds };
let camera: Promise<typeof import('./viewCamera.js')> | null = null;
const loadCamera = () => (camera ??= import('./viewCamera.js'));
const TARGETS = { resolveGuids, resolveSelector };

/** Widget (quad a obrys) aktívneho rezu; bez hodnoty sa nemení (#63). */
function applyGizmo(show: boolean | undefined): void {
  if (show === undefined) return;
  const state = useViewerStore.getState();
  if (state.sectionPlane.showGizmo !== show) state.setSectionPlaneShowGizmo(state.sectionPlane.id, show);
}

export function useAimViewCommands(bim: BimContext) {
  const { setMode, storeys } = useViewMode();
  const sectionToken = useRef(0);
  const run = (msg: ViewInboundMessage, origin = '*') => {
    const state = useViewerStore.getState();
    switch (msg.type) {
      case 'SET_SECTION': {
        // Novší rez zruší čakajúce opakovanie staršieho rezu cez prvok.
        const token = ++sectionToken.current;
        if (msg.action === 'clear') {
          clearSectionCut(useViewerStore.getState);
          return;
        }
        if (msg.action === 'gizmo') {
          // Len widget aktívneho rezu, rez ostáva (#63).
          applyGizmo(msg.showGizmo);
          return;
        }
        if (msg.storeyGuid) {
          const storey = pickStorey(storeys, msg.storeyGuid);
          if (!storey) {
            console.warn('[aim-bridge] SET_SECTION: neznáme podlažie', msg.storeyGuid);
            return;
          }
          // Rozsah, voči ktorému renderer reže, a rámec modelu, z ktorého je
          // elevácia podlažia (#63: holá federovaná obálka posunula rez).
          const range = sectionAxisRange(sectionRenderBounds(state), 'down');
          const own = state.models.get(storey.info.modelId) ?? [...state.models.values()].find((m) => m.geometryResult?.coordinateInfo);
          const offY = totalYupOffset(own?.geometryResult?.coordinateInfo).y;
          const position = storeyCutPercent(storey.elevation, msg.offsetM ?? 1.2, offY, range);
          if (position === null) return;
          showSectionCut(useViewerStore.getState, { axis: 'down', position, flipped: msg.flipped === true });
          applyGizmo(msg.showGizmo);
          return;
        }
        if (msg.guids?.length || msg.coordinate !== undefined) {
          // Rez cez prvok alebo na presnej súradnici IFC sveta (D-085).
          void loadQueries().then((q) => q.cutThroughTarget(msg, () => sectionToken.current === token, GUIDS, 0, () => applyGizmo(msg.showGizmo)));
          return;
        }
        if (msg.axis && msg.position !== undefined) {
          showSectionCut(useViewerStore.getState, {
            axis: VIEWER_AXIS[msg.axis],
            position: msg.position,
            flipped: msg.flipped === true,
          });
          applyGizmo(msg.showGizmo);
        }
        return;
      }
      case 'SET_CAMERA': {
        // Smer, Set view rezu, póza od hosta, rámovanie (AIM D-098) - lenivo.
        const step = cameraStep(msg.preset);
        void loadCamera().then((c) => c.runCamera(msg, step, bim, TARGETS));
        return;
      }
      case 'SET_VIEW_MODE': {
        const storey = pickStorey(storeys, msg.storeyGuid);
        if (storey === null) {
          console.warn('[aim-bridge] SET_VIEW_MODE: neznáme podlažie', msg.storeyGuid);
          return;
        }
        setMode(msg.mode, storey);
        return;
      }
      case 'QUERY': {
        void loadQueries().then((q) => q.answerQuery(msg, origin, GUIDS));
        return;
      }
    }
  };
  const ref = useRef(run);
  // Najnovšie podlažia a setMode bez re-registrácie listenera v AimBridge.
  useEffect(() => {
    ref.current = run;
  });
  return ref;
}

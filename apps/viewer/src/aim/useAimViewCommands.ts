/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Vykonanie bridge správ pohľadu (AIM D-083 fáza 1) cez existujúce cesty
 * viewera: rez cez `showSectionCut`/`clearSectionCut` (tá istá cesta ako SDK
 * `setSection` a BCF viewpoint, Section tool ho ukáže a dá sa posúvať),
 * kamera cez `cameraCallbacks` + `bim.viewer.flyTo`, režim cez `useViewMode`
 * (prepínač 3D|2D|Split, D-075). Vracia ref, aby ho listener v AimBridge
 * mohol volať bez re-registrácie. `QUERY` (AIM D-085) odpovedá cez `reply`.
 */

import { useEffect, useRef } from 'react';
import { useViewerStore } from '@/store';
import { clearSectionCut, showSectionCut } from '@/store/section-active';
import { mergedSectionBounds, sectionAxisRange } from '@/lib/section/section-distance';
import { totalYupOffset } from '@/lib/geo/coordinate-frame';
import { useViewMode } from '@/hooks/useViewMode';
import type { BimContext } from '@ifc-lite/sdk';
import { resolveGuids } from './bridge-protocol.js';
import type { SectionAxis, ViewInboundMessage, ViewQueryResult } from './view-protocol.js';
import {
  VIEWER_AXIS, cameraStep, cutPercent, ifcCoordinateToRender, pickStorey, sectionThroughBox, storeyCutPercent,
} from './viewCommands.js';
import { queryBounds, queryViewState, renderBoundsOfGuids, sectionBounds, worldOffset } from './viewQueries.js';

type Reply = (msg: ViewQueryResult) => void;

/**
 * Rez cez prvok z deep linku príde s MODELS_LOADED, keď sú modely naparsované,
 * ale geometria ešte len prúdi do scény - obálka prvku vtedy chýba. Skúša sa
 * znova, kým nepríde (alebo kým nepríde iný rez).
 */
const SECTION_RETRY_MS = 500;
const SECTION_RETRIES = 60;

export function useAimViewCommands(bim: BimContext) {
  const { setMode, storeys, mode, activeStorey } = useViewMode();
  const sectionToken = useRef(0);
  const run = (msg: ViewInboundMessage, reply?: Reply, attempt = 0) => {
    const state = useViewerStore.getState();
    switch (msg.type) {
      case 'SET_SECTION': {
        // Novší rez zruší čakajúce opakovanie staršieho.
        if (attempt === 0) sectionToken.current += 1;
        const token = sectionToken.current;
        if (msg.action === 'clear') {
          clearSectionCut(useViewerStore.getState);
          return;
        }
        if (msg.storeyGuid) {
          const storey = pickStorey(storeys, msg.storeyGuid);
          if (!storey) {
            console.warn('[aim-bridge] SET_SECTION: neznáme podlažie', msg.storeyGuid);
            return;
          }
          const range = sectionAxisRange(mergedSectionBounds(state.models, state.geometryResult), 'down');
          const first = [...state.models.values()].find((m) => m.geometryResult?.coordinateInfo);
          const offY = totalYupOffset(first?.geometryResult?.coordinateInfo).y;
          const position = storeyCutPercent(storey.elevation, msg.offsetM ?? 1.2, offY, range);
          if (position === null) return;
          showSectionCut(useViewerStore.getState, { axis: 'down', position, flipped: msg.flipped === true });
          return;
        }
        if (msg.guids?.length || msg.coordinate !== undefined) {
          // Rez cez prvok alebo na presnej súradnici IFC sveta (D-085).
          let target: { axis: SectionAxis; world: number } | null = null;
          if (msg.guids?.length) {
            const box = renderBoundsOfGuids(state, msg.guids).union;
            target = box ? sectionThroughBox(box, msg.fit ?? 'center', msg.axis) : null;
          } else if (msg.axis && msg.coordinate !== undefined) {
            target = { axis: msg.axis, world: ifcCoordinateToRender(msg.axis, msg.coordinate, worldOffset(state)) };
          }
          if (!target) {
            if (msg.guids?.length && attempt < SECTION_RETRIES) {
              setTimeout(() => {
                if (sectionToken.current === token) ref.current(msg, reply, attempt + 1);
              }, SECTION_RETRY_MS);
              return;
            }
            console.warn('[aim-bridge] SET_SECTION: prvok bez geometrie alebo bez osi', msg.guids ?? msg.coordinate);
            return;
          }
          const axis = VIEWER_AXIS[target.axis];
          const position = cutPercent(target.world, sectionAxisRange(sectionBounds(state), axis));
          if (position === null) return;
          showSectionCut(useViewerStore.getState, { axis, position, flipped: msg.flipped === true });
          return;
        }
        if (msg.axis && msg.position !== undefined) {
          showSectionCut(useViewerStore.getState, {
            axis: VIEWER_AXIS[msg.axis],
            position: msg.position,
            flipped: msg.flipped === true,
          });
        }
        return;
      }
      case 'SET_CAMERA': {
        if (msg.projection) state.setProjectionMode(msg.projection);
        const step = cameraStep(msg.preset);
        const cam = state.cameraCallbacks;
        if (step.kind === 'home') cam.home?.();
        else if (step.kind === 'fit') cam.fitAll?.();
        else cam.setPresetView?.(step.view);
        if (msg.guids?.length) {
          const refs = resolveGuids(state.models, msg.guids);
          if (refs.length > 0) bim.viewer.flyTo(refs);
        }
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
        if (!reply) return;
        try {
          const result = msg.query === 'bounds'
            ? queryBounds(state, msg.guids ?? [])
            : queryViewState(state, { mode, storeyGuid: activeStorey?.guid });
          reply({ source: msg.source, type: 'QUERY_RESULT', id: msg.id, ok: true, result });
        } catch (err) {
          reply({ source: msg.source, type: 'QUERY_RESULT', id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) });
        }
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

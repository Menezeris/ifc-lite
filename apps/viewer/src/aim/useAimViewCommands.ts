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
import { VIEWER_AXIS, cameraStep, focusViewStep, pickStorey, storeyCutPercent } from './viewCommands.js';
import { placementCoordinateInfo } from '@/lib/section/placement-coordinate-info';
import { sectionRenderBounds as sectionBoundsWith } from './sectionRange.js';
import { noteIssue, track } from './command-gate.js';

type FocusSummary = () => { count: number; guids: string[] };
/** Zvýraznenie z FOCUS (#94) - poskytne ho AimBridge po lenivom načítaní príkazov viditeľnosti. */
let focusProvider: FocusSummary | undefined;
export function setFocusProvider(f: FocusSummary | undefined): void {
  focusProvider = f;
}

/** Pohľad pre FOCUS (#97, V1): nastaví ho hook s najnovším režimom a podlažiami, volá ho lenivý FOCUS. */
let focusView: ((storeyKeys: readonly (string | null)[]) => void) | undefined;
export function prepareFocusView(storeyKeys: readonly (string | null)[]): void {
  focusView?.(storeyKeys);
}

/** D-085 (obálky, stav, rez cez prvok) sa načíta až pri prvom použití - mimo vstupného balíka. */
let queries: Promise<typeof import('./viewQueries.js')> | null = null;
const loadQueries = () => (queries ??= import('./viewQueries.js'));
/** Obálka, voči ktorej renderer reže (#63). */
const sectionRenderBounds = (state: Parameters<typeof sectionBoundsWith>[0]) => sectionBoundsWith(state, placementCoordinateInfo);
const GUIDS = { resolveGuids, guidForEntity, sectionRenderBounds };
let camera: Promise<typeof import('./viewCamera.js')> | null = null;
const loadCamera = () => (camera ??= import('./viewCamera.js'));
let panels: Promise<typeof import('./aimPanels.js')> | null = null;
const loadPanels = () => (panels ??= import('./aimPanels.js'));
let measure: Promise<typeof import('./measureShow.js')> | null = null;
/** Kóty od hosta (AIM D-124) - lenivo, mimo vstupného balíka. */
const loadMeasure = () => (measure ??= import('./measureShow.js'));
const TARGETS = { resolveGuids, resolveSelector };

/**
 * Posledná voľba widgetu od hosta. Každý nový rez zakladá rovinu so
 * zobrazeným widgetom, preto sa voľba použije aj na rez bez `showGizmo`
 * (#63, D-101); zrušenie rezu aj odpojenie mosta ju zabudne.
 */
let lastGizmo: boolean | undefined;

/** Widget (quad, obrys, nápoveda a rukoväť) aktívneho rezu; bez hodnoty platí posledná voľba. */
function applyGizmo(show: boolean | undefined): void {
  if (show !== undefined) lastGizmo = show;
  const want = show ?? lastGizmo;
  if (want === undefined) return;
  const state = useViewerStore.getState();
  if (state.sectionPlane.showGizmo !== want) state.setSectionPlaneShowGizmo(state.sectionPlane.id, want);
}

/** Stav pre `APPLIED` (D-101): rez, režim, výber a viditeľnosť po vykonaní príkazov. */
export async function appliedViewState(): Promise<Record<string, unknown>> {
  const q = await loadQueries();
  const s = q.queryViewState(useViewerStore.getState(), { ...GUIDS, focus: focusProvider });
  return {
    mode: s.mode, storey_guid: s.storey_guid, section: s.section, camera: s.camera,
    selection_count: s.selection.count, hidden_count: s.hidden_count, isolated_count: s.isolated_count, focus: s.focus,
    panels: s.panels, ...(s.property_focus ? { property_focus: s.property_focus } : {}), ...(s.document ? { document: s.document } : {}),
  };
}


export function useAimViewCommands(bim: BimContext) {
  const { mode, setMode, setStorey, storeys, activeStorey } = useViewMode();
  const sectionToken = useRef(0);
  // Voľba widgetu patrí relácii mosta: nová relácia (iný `bim`) začína s predvoleným widgetom.
  useEffect(() => {
    // Dotazy stavu sa stiahnu hneď po pripojení: prvé `APPLIED` (D-101) na ne inak čakalo (D-102).
    void loadQueries();
    return () => { lastGizmo = undefined; };
  }, [bim]);
  const run = (msg: ViewInboundMessage, origin = '*') => {
    const state = useViewerStore.getState();
    switch (msg.type) {
      case 'SET_SECTION': {
        if (msg.action === 'gizmo') {
          // Len widget aktívneho rezu, rez ostáva (#63); čakajúci rez cez prvok neruší.
          applyGizmo(msg.showGizmo);
          return;
        }
        // Novší rez zruší čakajúce opakovanie staršieho rezu cez prvok.
        const token = ++sectionToken.current;
        if (msg.action === 'clear') {
          lastGizmo = undefined;
          clearSectionCut(useViewerStore.getState);
          return;
        }
        if (msg.storeyGuid) {
          const storey = pickStorey(storeys, msg.storeyGuid);
          if (!storey) {
            noteIssue('SET_SECTION: podlažie sa vo vieweri nenašlo');
            return;
          }
          // Rozsah, voči ktorému renderer reže, a rámec modelu, z ktorého je
          // elevácia podlažia (#63: holá federovaná obálka posunula rez).
          const range = sectionAxisRange(sectionRenderBounds(state), 'down');
          // Rámec modelu podlažia; kým jeho geometria ešte prúdi, rámec prvého načítaného modelu.
          const frame = state.models.get(storey.info.modelId)?.geometryResult?.coordinateInfo
            ?? [...state.models.values()].find((m) => m.geometryResult?.coordinateInfo)?.geometryResult?.coordinateInfo;
          const offY = totalYupOffset(frame).y;
          const position = storeyCutPercent(storey.elevation, msg.offsetM ?? 1.2, offY, range);
          if (position === null) {
            noteIssue('SET_SECTION: rozsah modelu pre rez nie je známy');
            return;
          }
          showSectionCut(useViewerStore.getState, { axis: 'down', position, flipped: msg.flipped === true });
          applyGizmo(msg.showGizmo);
          return;
        }
        if (msg.guids?.length || msg.coordinate !== undefined) {
          // Rez cez prvok alebo na presnej súradnici IFC sveta (D-085).
          track(loadQueries()
            .then((q) => q.cutThroughTarget(msg, () => sectionToken.current === token, GUIDS, () => applyGizmo(msg.showGizmo)))
            .then((ok) => { if (!ok) noteIssue('SET_SECTION: prvok bez geometrie alebo bez osi'); }));
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
        track(loadCamera().then((c) => c.runCamera(msg, step, bim, TARGETS)));
        return;
      }
      case 'MEASURE_SHOW': {
        track(loadMeasure().then((m) => m.showMeasurements(msg)));
        return;
      }
      case 'SET_PANELS': {
        track(loadPanels().then((m) => m.applyPanels(msg.panels, noteIssue)));
        return;
      }
      case 'SET_VIEW_MODE': {
        const storey = pickStorey(storeys, msg.storeyGuid);
        if (storey === null) {
          noteIssue('SET_VIEW_MODE: podlažie sa vo vieweri nenašlo');
          return;
        }
        setMode(msg.mode, storey);
        return;
      }
      case 'QUERY': {
        void loadQueries().then((q) => q.answerQuery(msg, origin, { ...GUIDS, focus: focusProvider }));
        return;
      }
    }
  };
  const ref = useRef(run);
  // Najnovšie podlažia a setMode bez re-registrácie listenera v AimBridge.
  useEffect(() => {
    ref.current = run;
    focusView = (keys) => {
      const step = focusViewStep(mode, keys, activeStorey?.key ?? null, new Set(storeys.map((s) => s.key)));
      if (step.kind === '3d') setMode('3d');
      else if (step.kind === 'storey') {
        const storey = storeys.find((s) => s.key === step.key);
        if (storey) setStorey(storey);
      }
    };
  });
  return ref;
}

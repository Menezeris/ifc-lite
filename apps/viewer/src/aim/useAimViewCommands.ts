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
import { preloadTabs, useAimViewTabs, withTabs } from './viewTabsStore.js';
import { sceneMode, settle3d } from './sceneMode.js';
import { VIEWER_AXIS, cameraStep, focusViewStep, pickStorey, storeyCutPercent } from './viewCommands.js';
import { placementCoordinateInfo } from '@/lib/section/placement-coordinate-info';
import { sectionRenderBounds as sectionBoundsWith } from './sectionRange.js';
import { noteIssue, track } from './command-gate.js';
import { waitCameraSettled } from './cameraSettle.js';

type FocusSummary = () => { count: number; guids: string[] };
/** Zvýraznenie z FOCUS (#94) - poskytne ho AimBridge po lenivom načítaní príkazov viditeľnosti. */
let focusProvider: FocusSummary | undefined;
export function setFocusProvider(f: FocusSummary | undefined): void {
  focusProvider = f;
}

/** Zmeny pohľadu od posledného potvrdeného príkazu (D-125) - poskytne ich AimBridge pre `view_state`. */
let changesProvider: (() => string[]) | undefined;
export function setChangesProvider(f: (() => string[]) | undefined): void {
  changesProvider = f;
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
let panelScroll: Promise<typeof import('./aimPanelScroll.js')> | null = null;
const loadPanelScroll = () => (panelScroll ??= import('./aimPanelScroll.js'));
/** Rezný box (AIM D-132): modul stiahnutý pri pripojení, aby box bežal v poradí s ostatnými príkazmi. */
let boxModules: [typeof import('./viewQueries.js'), typeof import('./sectionBox.js')] | null = null;
const loadBox = () => Promise.all([loadQueries(), import('./sectionBox.js')]).then((m) => (boxModules = m));
let measure: Promise<typeof import('./measureShow.js')> | null = null;
/** Kóty od hosta (AIM D-124) - lenivo, mimo vstupného balíka. */
const loadMeasure = () => (measure ??= import('./measureShow.js'));
let route: Promise<typeof import('./routeShow.js')> | null = null;
const loadRoute = () => (route ??= import('./routeShow.js'));
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

/** Rezný box (AIM D-132) - tie isté obálky ako rez cez prvok, lenivo. */
export function runSectionBox(raw: unknown): void {
  const run = ([q, b]: NonNullable<typeof boxModules>) => {
    if (!b.isSectionBoxMessage(raw)) return noteIssue('SET_SECTION_BOX: neplatná správa');
    track(q.applySectionBox(raw, GUIDS).then((ok) => { if (!ok) noteIssue('SET_SECTION_BOX: prvky bez geometrie'); }));
  };
  if (boxModules) run(boxModules);
  else track(loadBox().then(run));
}

/** Stav pre `APPLIED` (D-101): rez, režim, výber a viditeľnosť po vykonaní príkazov. */
export async function appliedViewState(): Promise<Record<string, unknown>> {
  const q = await loadQueries();
  // Kamera po obnove pohľadu ešte dobieha animáciu; stav má niesť jej cieľ (AIM #97, D-122).
  const settled = await waitCameraSettled(() => useViewerStore.getState().cameraCallbacks.getViewpoint?.() ?? null);
  const s = q.queryViewState(useViewerStore.getState(), { ...GUIDS, focus: focusProvider });
  return {
    mode: s.mode, storey_guid: s.storey_guid, section: s.section, camera: s.camera,
    // Limit vypršal počas pohybu (používateľ otáča kamerou): póza nie je cieľ, nech to host vie.
    ...(settled ? {} : { camera_moving: true }),
    selection_count: s.selection.count, hidden_count: s.hidden_count, isolated_count: s.isolated_count, focus: s.focus,
    panels: s.panels, ...(s.panel_view ? { panel_view: s.panel_view } : {}), tabs: s.tabs, ...(s.property_focus ? { property_focus: s.property_focus } : {}), ...(s.document ? { document: s.document } : {}),
  };
}


export function useAimViewCommands(bim: BimContext) {
  const { mode, setMode, setStorey, storeys, activeStorey } = useViewMode();
  const sectionToken = useRef(0);
  // Voľba widgetu patrí relácii mosta: nová relácia (iný `bim`) začína s predvoleným widgetom.
  useEffect(() => {
    // Dotazy stavu sa stiahnu hneď po pripojení: prvé `APPLIED` (D-101) na ne inak čakalo (D-102).
    void loadQueries();
    // Záložky a rezný box (D-132) tiež: ich príkazy idú synchrónne v poradí s ďalšími.
    void preloadTabs();
    void loadBox();
    return () => { lastGizmo = undefined; };
  }, [bim]);
  /** Záložka 3D bez zvyšného zámku kamery, rezu podlažia a ortografickej projekcie (#216). */
  const free3d = () => {
    const s = useViewerStore.getState();
    const step = settle3d({ viewLocked: s.underlayViewLocked, splitView: s.underlaySplitView, projection: s.projectionMode === 'orthographic' ? 'orthographic' : 'perspective' });
    if (step.leaveLocked) setMode('3d');
    if (step.perspective) s.setProjectionMode('perspective');
  };
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
      case 'ROUTE_SHOW': {
        // Čiara trasy od hosta (AIM D-137) - lenivo, kreslí ju AimRouteLayer.
        track(loadRoute().then((m) => m.showRoute(msg)));
        return;
      }
      case 'SET_PANELS': {
        track(loadPanels().then((m) => m.applyPanels(msg.panels, noteIssue)));
        return;
      }
      case 'SCROLL_PANEL': {
        track(loadPanelScroll().then((m) => m.scrollPanel(msg, noteIssue)));
        return;
      }
      case 'ZOOM_PANEL': {
        track(loadPanelScroll().then((m) => m.zoomPanel(msg.zoom, msg.panel, noteIssue)));
        return;
      }
      case 'SET_VIEW_MODE': {
        const storey = pickStorey(storeys, msg.storeyGuid);
        if (storey === null) {
          noteIssue('SET_VIEW_MODE: podlažie sa vo vieweri nenašlo');
          return;
        }
        // AIM D-132: 3D = záložka 3D, 2D = pôdorys podlažia v záložke, Split = pôdorys vedľa 3D.
        const target = storey ?? activeStorey ?? storeys[0];
        const p = withTabs((m) => {
          if (msg.mode === '3d') { m.activate('3d', noteIssue); m.beside(null, noteIssue); return; }
          if (!target) return noteIssue('SET_VIEW_MODE: model nemá podlažia');
          if (msg.mode === 'split') m.activate('3d', noteIssue);
          m.openPlan(target.guid, { beside: msg.mode === 'split' }, noteIssue);
        });
        // 3D vždy perspektívna a voľná, aj keď 3D záložka už bola aktívna (#216).
        const done = msg.mode === '3d' ? (p ? p.then(free3d) : free3d()) : p;
        if (done) track(done);
        return;
      }
      case 'QUERY': {
        void loadQueries().then((q) => q.answerQuery(msg, origin, { ...GUIDS, focus: focusProvider, changes: changesProvider }));
        return;
      }
    }
  };
  const ref = useRef(run);
  // Najnovšie podlažia a setMode bez re-registrácie listenera v AimBridge.
  useEffect(() => {
    ref.current = run;
    focusView = (keys) => {
      // Záložka 3D sa pri FOCUS nikdy neprepne do 2D; pôdorys prejde cez záložky (#216).
      const tabs = useAimViewTabs.getState();
      const kind = tabs.tabs.find((t) => t.id === tabs.sceneId)?.kind;
      const step = focusViewStep(sceneMode(kind, mode), keys, activeStorey?.key ?? null, new Set(storeys.map((s) => s.key)));
      if (step.kind === '3d') {
        const p = withTabs((m) => { m.activate('3d', noteIssue); m.beside(null, noteIssue); });
        track(Promise.resolve(p).then(free3d));
      } else if (step.kind === 'storey') {
        const storey = storeys.find((s) => s.key === step.key);
        if (!storey) return;
        if (kind === 'plan') {
          const p = withTabs((m) => m.openPlan(storey.guid, {}, noteIssue));
          if (p) track(p);
        } else setStorey(storey);
      }
    };
  });
  return ref;
}

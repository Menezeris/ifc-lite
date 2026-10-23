/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Vykonanie bridge správ pohľadu (AIM D-083 fáza 1) cez existujúce cesty
 * viewera: rez cez `showSectionCut`/`clearSectionCut` (tá istá cesta ako SDK
 * `setSection` a BCF viewpoint, Section tool ho ukáže a dá sa posúvať),
 * kamera cez `cameraCallbacks` + `bim.viewer.flyTo` (lenivo `viewCamera.ts`, D-098). `SET_VIEW_MODE`
 * nie je režim (D-161): `2d` = kamera zhora a vodorovný rez na bežnom 3D canvase (alebo uložený pohľad
 * podlažia z Presentation), `3d` = perspektívna kamera, `split` = dlaždice (3D + výkres PDF podlažia). Vracia ref, aby ho listener v AimBridge
 * mohol volať bez re-registrácie. `QUERY` (AIM D-085) odpovedá rodičovi na `origin`.
 */

import { useEffect, useRef } from 'react';
import { useViewerStore } from '@/store';
import { clearSectionCut, showSectionCut } from '@/store/section-active';
import { percentToWorld, sectionAxisRange } from '@/lib/section/section-distance';
import { totalYupOffset } from '@/lib/geo/coordinate-frame';
import { useFloorplanView } from '@/hooks/useFloorplanView';
import type { BimContext } from '@ifc-lite/sdk';
import { guidForEntity, resolveGuids, resolveSelector } from './bridge-protocol.js';
import type { ViewInboundMessage } from './view-protocol.js';
import { preloadTabs, setTopView, withTabs } from './viewTabsStore.js';
import { VIEWER_AXIS, cameraStep, pickStorey, storeyCutPercent } from './viewCommands.js';
import { pickStoreyView, type StoreyViewCandidate } from './storeyViews.js';
import { placementCoordinateInfo } from '@/lib/section/placement-coordinate-info';
import { sectionRenderBounds as sectionBoundsWith } from './sectionRange.js';
import { noteIssue, track } from './command-gate.js';
import { waitCameraSettled } from './cameraSettle.js';
import { AUTO_ROTATE_SPEED } from './autoRotatePlan.js';
import { useAimUnderlays3d } from './aimUnderlays3d.js';

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
/** Otáčanie kamery dokola (AIM #247) - lenivo, bežiaca slučka sa pri odpojení mosta zastaví. */
let autoRotate: Promise<typeof import('./autoRotate.js')> | null = null;
const loadAutoRotate = () => (autoRotate ??= import('./autoRotate.js'));
/** Otáčanie práve beží: `APPLIED` nečaká na ustálenie kamery, ktorá sa nikdy neustáli. */
let autoRotating = false;
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

/** Uložené pohľady z Presentation (AIM D-161): lenivý most, ktorý sa pripojí pri prvej správe hosta. */
let views: Promise<typeof import('./viewsBridge.js')> | null = null;
export function runViewsMessage(raw: unknown, post: (msg: unknown) => void): void {
  track((views ??= import('./viewsBridge.js')).then((m) => m.runViewsMessage(raw, { post, noteIssue, track, guids: GUIDS })));
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

/** Podlažie pre rez a pohľad zhora: elevácia v IFC (m) a model, z ktorého je rámec. */
interface CutStorey { elevation: number; info: { modelId: string } }

/**
 * Vodorovný rez `offsetM` metrov nad úrovňou podlažia (tá istá cesta ako `SET_SECTION` s podlažím a `mode=2d`).
 * false = rozsah modelu pre rez ešte nie je známy.
 */
function cutAtStorey(storey: CutStorey, offsetM: number, flipped: boolean, showGizmo: boolean | undefined): boolean {
  const state = useViewerStore.getState();
  // Rozsah, voči ktorému renderer reže, a rámec modelu, z ktorého je
  // elevácia podlažia (#63: holá federovaná obálka posunula rez).
  const range = sectionAxisRange(sectionRenderBounds(state), 'down');
  // Rámec modelu podlažia; kým jeho geometria ešte prúdi, rámec prvého načítaného modelu.
  const frame = state.models.get(storey.info.modelId)?.geometryResult?.coordinateInfo
    ?? [...state.models.values()].find((m) => m.geometryResult?.coordinateInfo)?.geometryResult?.coordinateInfo;
  const offY = totalYupOffset(frame).y;
  const position = storeyCutPercent(storey.elevation, offsetM, offY, range);
  if (position === null) return false;
  showSectionCut(useViewerStore.getState, { axis: 'down', position, flipped });
  applyGizmo(showGizmo);
  return true;
}

/** Výška rezu nad podlahou pre pohľad zhora (`mode=2d`), m: štandardný rez pôdorysu. */
const TOP_VIEW_CUT_M = 1.2;

/** Perspektívna kamera po `mode=3d`; z pohľadu zhora (ortho) sa vráti aj do izometrie. */
function perspective3d(): void {
  const s = useViewerStore.getState();
  if (s.projectionMode === 'perspective') return;
  s.setProjectionMode('perspective');
  s.cameraCallbacks.home?.();
}

/** Stav pre `APPLIED` (D-101): rez, režim, výber a viditeľnosť po vykonaní príkazov. */
export async function appliedViewState(): Promise<Record<string, unknown>> {
  const q = await loadQueries();
  // Kamera po obnove pohľadu ešte dobieha animáciu; stav má niesť jej cieľ (AIM #97, D-122).
  const settled = await waitCameraSettled(() => (autoRotating ? null : useViewerStore.getState().cameraCallbacks.getViewpoint?.() ?? null));
  const s = q.queryViewState(useViewerStore.getState(), { ...GUIDS, focus: focusProvider });
  return {
    ...(autoRotating ? { auto_rotate: true } : {}),
    section: s.section, camera: s.camera, view: s.view,
    // Limit vypršal počas pohybu (používateľ otáča kamerou): póza nie je cieľ, nech to host vie.
    ...(settled ? {} : { camera_moving: true }),
    selection_count: s.selection.count, hidden_count: s.hidden_count, isolated_count: s.isolated_count, focus: s.focus,
    panels: s.panels, underlays_3d: s.underlays_3d, ...(s.panel_view ? { panel_view: s.panel_view } : {}), tabs: s.tabs, layout: s.layout, ...(s.property_focus ? { property_focus: s.property_focus } : {}), ...(s.document ? { document: s.document } : {}),
  };
}


export function useAimViewCommands(bim: BimContext) {
  const { storeyOptions: storeys } = useFloorplanView();
  const sectionToken = useRef(0);
  // Voľba widgetu patrí relácii mosta: nová relácia (iný `bim`) začína s predvoleným widgetom.
  useEffect(() => {
    // Dotazy stavu sa stiahnu hneď po pripojení: prvé `APPLIED` (D-101) na ne inak čakalo (D-102).
    void loadQueries();
    // Záložky a rezný box (D-132) tiež: ich príkazy idú synchrónne v poradí s ďalšími.
    void preloadTabs();
    void loadBox();
    return () => {
      lastGizmo = undefined;
      autoRotating = false;
      void autoRotate?.then((m) => m.stopAutoRotate());
      void views?.then((m) => m.stopViewsBridge());
    };
  }, [bim]);
  /**
   * Pohľad zhora na podlažie (`mode=2d`, D-161) na bežnom 3D canvase: bez zámku a bez záložky. Ak je v
   * Presentation uložený pohľad toho podlažia (vodorovný rez v jeho rozsahu), aktivuje sa ten; inak
   * rez 1,2 m nad podlahou a ortografická kamera zhora. Orbit, posun a nástroje fungujú hneď ďalej.
   */
  const openTop = async (guid: string | undefined, note: (issue: string) => void): Promise<void> => {
    const target = guid ? storeys.find((s) => s.guid === guid) : storeys[0];
    if (!target) return note(guid ? 'SET_VIEW_MODE: podlažie sa vo vieweri nenašlo' : 'SET_VIEW_MODE: model nemá podlažia');
    const state = useViewerStore.getState();
    const bounds = sectionRenderBounds(state);
    const offY = totalYupOffset(state.models.get(target.info.modelId)?.geometryResult?.coordinateInfo
      ?? [...state.models.values()].find((m) => m.geometryResult?.coordinateInfo)?.geometryResult?.coordinateInfo).y;
    const range = sectionAxisRange(bounds, 'down');
    const candidates: StoreyViewCandidate[] = state.basketViews.map((v) => ({
      id: v.id, name: v.name,
      cutZ: (v.section?.planes ?? (v.section ? [v.section.plane] : [])).flatMap((p) => (
        p.enabled && p.axis === 'down' && !p.box && !p.custom && range ? [percentToWorld(p.position, range) + offY] : []
      )),
    }));
    const viewId = pickStoreyView(candidates, storeys, target.guid);
    if (viewId) {
      const { activateBasketViewFromStore } = await import('@/store/basket/basketViewActivator');
      activateBasketViewFromStore(viewId);
      return;
    }
    if (!cutAtStorey(target, TOP_VIEW_CUT_M, false, undefined)) return note('SET_VIEW_MODE: rozsah modelu pre rez nie je známy');
    state.setProjectionMode('orthographic');
    state.cameraCallbacks.setPresetView?.('top');
  };
  const run = (msg: ViewInboundMessage, origin = '*') => {
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
          if (!cutAtStorey(storey, msg.offsetM ?? 1.2, msg.flipped === true, msg.showGizmo)) noteIssue('SET_SECTION: rozsah modelu pre rez nie je známy');
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
      case 'AUTO_ROTATE': {
        track(loadAutoRotate().then((m) => {
          if (msg.action === 'stop') { m.stopAutoRotate(); autoRotating = false; return; }
          autoRotating = m.startAutoRotate(msg.speedDegS ?? AUTO_ROTATE_SPEED.default, msg.direction ?? 'left', {
            noteIssue,
            onEnded: () => { autoRotating = false; },
          });
        }));
        return;
      }
      case 'SET_UNDERLAYS_3D': {
        useAimUnderlays3d.getState().setShown(msg.show);
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
        // AIM D-161: žiadny režim 2D. 3D = perspektívna kamera, 2D = pohľad zhora na podlažie na tom istom 3D
        // canvase, split = dlaždice 3D + výkres PDF podlažia (D-157). Dokument na celú plochu sa vráti na 3D záložku.
        const target = storey ?? storeys[0];
        const p = withTabs((m) => {
          m.activate('3d');
          if (msg.mode === '3d') { m.beside(null, noteIssue); return; }
          const top = openTop(target?.guid, noteIssue);
          if (msg.mode !== 'split' || !target) return top;
          return top.then(() => m.splitWithDrawing(target.guid, noteIssue));
        });
        const done = msg.mode === '3d' ? (p ? p.then(perspective3d) : perspective3d()) : p;
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
  // Najnovšie podlažia bez re-registrácie listenera v AimBridge; staršie `VIEW_TABS open` pre pôdorys idú cez ne.
  useEffect(() => {
    ref.current = run;
    setTopView(openTop);
    return () => setTopView(null);
  });
  return ref;
}

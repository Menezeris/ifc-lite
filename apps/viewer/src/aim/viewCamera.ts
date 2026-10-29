/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Vykonanie `SET_CAMERA` (AIM D-083, D-098) len cez existujúce cesty viewera:
 * smer cez `cameraCallbacks` (preset, home, fitAll), pohľad kolmo na rez ako
 * tlačidlo Set view (#7545, `presetViewForAxis` / `customPlaneViewpoint`),
 * póza od hosta cez `applyViewpoint` (tá istá cesta ako BCF), rámovanie cez
 * `bim.viewer.flyTo`, `fitAll` (viditeľné, #5884) a `frameSelection`. Okraj a
 * časť cieľa (AIM D-128) rámuje `frameBounds` s okrajom nad obálkami prvkov.
 * Relatívny zoom/orbit/posun počíta host a pošle hotovú pózu. Lenivý modul -
 * vo vstupnom balíku nie je.
 */

import { useViewerStore } from '@/store';
import { toGlobalIdFromModels } from '@/store/globalId';
import { activeSectionPlane } from '@/store/section-active';
import { bcfWorldOffset } from '@/hooks/bcf/viewpoint-world-frame';
import { customPlaneViewpoint } from '@/lib/section/section-set-view';
import { presetViewForAxis } from '@/components/viewer/tools/sectionConstants';
import type { BimContext } from '@ifc-lite/sdk';
import type { resolveGuids, resolveSelector } from './bridge-protocol.js';
import type { BridgeViewpoint, ViewInboundMessage } from './view-protocol.js';
import type { CameraStep } from './viewCommands.js';
import { ifcDirToRender, ifcPointToRender, unionBoxes, type Box3 } from './viewFrame.js';
import { renderBoundsOfIds } from './viewQueries.js';
import { pickArea, screenAxes } from './cameraArea.js';
import { noteIssue } from './command-gate.js';
import { applyFacePreset } from './presetFresh.js';

type State = ReturnType<typeof useViewerStore.getState>;
type CameraMessage = Extract<ViewInboundMessage, { type: 'SET_CAMERA' }>;

/** Rozklad cieľa z `bridge-protocol.ts`, odovzdaný volajúcim (perf ratchet, ako `GuidHelpers`). */
export interface TargetHelpers { resolveGuids: typeof resolveGuids; resolveSelector: typeof resolveSelector }

/** Rezerva po animácii smeru, kým sa do kamery zapíše jej koncový bod. */
const FRAME_SLACK_MS = 50;
/** Rovnaké trvanie ako tlačidlo Set view. */
const SECTION_VIEW_MS = 400;
const VIEWPOINT_MS = 300;
/** Rámovanie cieľa (`flyTo`, `fitAll`, `frameSelection`, `frameBounds`) animuje 300 ms. */
const FRAME_MS = 300;

/** Novší príkaz zruší rámovanie, ktoré ešte čaká na koniec animácie staršieho. */
let latest = 0;

/** Neúspech kroku ide do `APPLIED.issues`, nie len do konzoly (AIM D-101). */
function cameraNotReady(step: string): false {
  noteIssue(`SET_CAMERA ${step}: kamera viewera ešte nie je pripravená`);
  return false;
}

/** Póza od hosta (IFC svet) -> render rámec, s FOV a projekciou, ktoré kamera práve má. */
function applyHostViewpoint(state: State, vp: BridgeViewpoint): boolean {
  const cam = state.cameraCallbacks;
  const current = cam.getViewpoint?.();
  if (!current || !cam.applyViewpoint) return cameraNotReady('viewpoint');
  const offset = bcfWorldOffset(state.models, state.geometryResult);
  cam.applyViewpoint({
    ...current,
    position: ifcPointToRender(vp.position, offset),
    target: ifcPointToRender(vp.target, offset),
    up: ifcDirToRender(vp.up),
    ...(vp.orthoSize !== undefined ? { orthoSize: vp.orthoSize } : {}),
  }, true, VIEWPOINT_MS);
  return true;
}

/** Set view aktívneho rezu; bez rezu nič (host to vie z `view_state`). */
function lookAtSection(state: State): boolean {
  const plane = activeSectionPlane(state);
  const cam = state.cameraCallbacks;
  if (!plane || plane.box) {
    noteIssue('SET_CAMERA section: žiadny aktívny rez');
    return false;
  }
  if (plane.custom) {
    const current = cam.getViewpoint?.();
    if (!current || !cam.applyViewpoint) return cameraNotReady('section');
    cam.applyViewpoint(customPlaneViewpoint({ flipped: plane.flipped, custom: plane.custom }, current), true, SECTION_VIEW_MS);
    return true;
  }
  if (!cam.setPresetView) return cameraNotReady('section');
  cam.setPresetView(presetViewForAxis(plane.axis, plane.flipped));
  return true;
}

/** Zmení smer; vráti, ako dlho animuje (0 = hneď). */
function setDirection(state: State, msg: CameraMessage, step: CameraStep): number {
  const cam = state.cameraCallbacks;
  if (msg.viewpoint) {
    return applyHostViewpoint(state, msg.viewpoint) ? VIEWPOINT_MS : 0;
  }
  switch (step.kind) {
    case 'home': cam.home?.(); return 500;
    case 'fit': cam.fitAll?.(); return 0;
    // Vždy ako prvé kliknutie na stranu, nie ďalší krok cyklu ViewCube (AIMviewer#324).
    case 'preset': applyFacePreset(cam, step.view); return 300;
    case 'section': return lookAtSection(state) ? SECTION_VIEW_MS : 0;
    case 'keep': return 0;
  }
}

/** Obálky cieľa alebo výberu po prvkoch (zostava = jej časti), render rámec; prvky bez geometrie vypadnú. */
function frameBoxes(state: State, msg: CameraMessage, g: TargetHelpers): Box3[] {
  let ids: number[];
  if (msg.guids?.length || msg.selector) {
    const refs = msg.guids?.length ? g.resolveGuids(state.models, msg.guids) : g.resolveSelector(state.models, msg.selector!);
    ids = refs.map((r) => toGlobalIdFromModels(state.models, r.modelId, r.expressId));
  } else {
    ids = state.selectedEntityIds.size > 0
      ? [...state.selectedEntityIds]
      : state.selectedEntityId !== null ? [state.selectedEntityId] : [];
  }
  return ids.map((id) => renderBoundsOfIds(state, [id])).filter((b): b is Box3 => b !== null);
}

/**
 * Okraj a časť cieľa (AIM D-128): z obálok prvkov vyberie časť podľa aktuálneho
 * smeru (`pickArea`) a zarámuje ich `frameBounds` s okrajom; smer ostáva.
 * Promise skončí po animácii, aby `APPLIED` hlásilo koncovú pózu.
 */
async function frameWithMargin(msg: CameraMessage, g: TargetHelpers): Promise<void> {
  const state = useViewerStore.getState();
  const cam = state.cameraCallbacks;
  let boxes = frameBoxes(state, msg, g);
  if (boxes.length === 0) {
    noteIssue(msg.fit === 'selection' ? 'SET_CAMERA: výber bez geometrie' : 'SET_CAMERA: cieľ bez prvkov');
    return;
  }
  if (msg.area) {
    const vp = cam.getViewpoint?.();
    const axes = vp ? screenAxes(vp) : null;
    if (!axes) {
      cameraNotReady('area');
      return;
    }
    boxes = pickArea(boxes, msg.area, axes).map((i) => boxes[i]);
  }
  const box = unionBoxes(boxes);
  if (!box || !cam.frameBounds) {
    cameraNotReady('frame');
    return;
  }
  const ok = await cam.frameBounds(box.min, box.max, { padding: msg.padding, durationMs: FRAME_MS });
  if (!ok) noteIssue('SET_CAMERA: cieľ bez platnej obálky');
}

function frameTarget(msg: CameraMessage, bim: BimContext, g: TargetHelpers): Promise<void> {
  const state = useViewerStore.getState();
  if (msg.padding !== undefined || msg.area) {
    if (msg.guids?.length || msg.selector || msg.fit === 'selection') return frameWithMargin(msg, g);
    noteIssue('SET_CAMERA: okraj a časť potrebujú cieľ alebo výber');
  }
  if (msg.guids?.length || msg.selector) {
    const refs = msg.guids?.length ? g.resolveGuids(state.models, msg.guids) : g.resolveSelector(state.models, msg.selector!);
    if (refs.length > 0) bim.viewer.flyTo(refs);
    else noteIssue('SET_CAMERA: cieľ bez prvkov');
  } else if (msg.fit === 'visible') {
    state.cameraCallbacks.fitAll?.();
  } else if (msg.fit === 'selection') {
    state.cameraCallbacks.frameSelection?.();
  }
  // Rámovanie animuje; `APPLIED` (D-101) čítalo kameru pred koncom a hlásilo pózu presetu (AIMviewer#172).
  return new Promise<void>((r) => setTimeout(r, FRAME_MS + FRAME_SLACK_MS));
}

/**
 * Poradie: projekcia, smer, rámovanie. Rámovanie počíta pózu z aktuálneho
 * smeru, preto ide až po animácii smeru - spustené hneď prepísalo koncový bod
 * animácie a preset s cieľom kamerou nepohol (AIMviewer #65).
 */
export function runCamera(msg: CameraMessage, step: CameraStep, bim: BimContext, g: TargetHelpers): Promise<void> {
  const token = ++latest;
  const state = useViewerStore.getState();
  if (msg.projection) state.setProjectionMode(msg.projection);
  const wait = setDirection(state, msg, step);
  // Promise skončí po animácii a rámovaní, aby `APPLIED` (D-101) hlásilo koncovú pózu.
  const settle = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  if (!msg.guids?.length && !msg.selector && !msg.fit) return wait > 0 ? settle(wait + FRAME_SLACK_MS) : Promise.resolve();
  const frame = () => (token === latest ? frameTarget(msg, bim, g) : Promise.resolve());
  if (wait <= 0) return frame();
  return settle(wait + FRAME_SLACK_MS).then(frame);
}

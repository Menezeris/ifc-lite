/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Vykonanie `SET_CAMERA` (AIM D-083, D-098) len cez existujúce cesty viewera:
 * smer cez `cameraCallbacks` (preset, home, fitAll), pohľad kolmo na rez ako
 * tlačidlo Set view (#7545, `presetViewForAxis` / `customPlaneViewpoint`),
 * póza od hosta cez `applyViewpoint` (tá istá cesta ako BCF), rámovanie cez
 * `bim.viewer.flyTo`, `fitAll` (viditeľné, #5884) a `frameSelection`.
 * Relatívny zoom/orbit/posun počíta host a pošle hotovú pózu. Lenivý modul -
 * vo vstupnom balíku nie je.
 */

import { useViewerStore } from '@/store';
import { activeSectionPlane } from '@/store/section-active';
import { bcfWorldOffset } from '@/hooks/bcf/viewpoint-world-frame';
import { customPlaneViewpoint } from '@/lib/section/section-set-view';
import { presetViewForAxis } from '@/components/viewer/tools/sectionConstants';
import type { BimContext } from '@ifc-lite/sdk';
import type { resolveGuids, resolveSelector } from './bridge-protocol.js';
import type { BridgeViewpoint, ViewInboundMessage } from './view-protocol.js';
import type { CameraStep } from './viewCommands.js';
import { ifcDirToRender, ifcPointToRender } from './viewFrame.js';

type State = ReturnType<typeof useViewerStore.getState>;
type CameraMessage = Extract<ViewInboundMessage, { type: 'SET_CAMERA' }>;

/** Rozklad cieľa z `bridge-protocol.ts`, odovzdaný volajúcim (perf ratchet, ako `GuidHelpers`). */
export interface TargetHelpers { resolveGuids: typeof resolveGuids; resolveSelector: typeof resolveSelector }

/** Rezerva po animácii smeru, kým sa do kamery zapíše jej koncový bod. */
const FRAME_SLACK_MS = 50;
/** Rovnaké trvanie ako tlačidlo Set view. */
const SECTION_VIEW_MS = 400;
const VIEWPOINT_MS = 300;

/** Novší príkaz zruší rámovanie, ktoré ešte čaká na koniec animácie staršieho. */
let latest = 0;

/** Póza od hosta (IFC svet) -> render rámec, s FOV a projekciou, ktoré kamera práve má. */
function applyHostViewpoint(state: State, vp: BridgeViewpoint): void {
  const cam = state.cameraCallbacks;
  const current = cam.getViewpoint?.();
  if (!current || !cam.applyViewpoint) return;
  const offset = bcfWorldOffset(state.models, state.geometryResult);
  cam.applyViewpoint({
    ...current,
    position: ifcPointToRender(vp.position, offset),
    target: ifcPointToRender(vp.target, offset),
    up: ifcDirToRender(vp.up),
    ...(vp.orthoSize !== undefined ? { orthoSize: vp.orthoSize } : {}),
  }, true, VIEWPOINT_MS);
}

/** Set view aktívneho rezu; bez rezu nič (host to vie z `view_state`). */
function lookAtSection(state: State): boolean {
  const plane = activeSectionPlane(state);
  const cam = state.cameraCallbacks;
  if (!plane || plane.box) {
    console.warn('[aim-bridge] SET_CAMERA section: žiadny aktívny rez');
    return false;
  }
  if (plane.custom) {
    const current = cam.getViewpoint?.();
    if (!current || !cam.applyViewpoint) return false;
    cam.applyViewpoint(customPlaneViewpoint({ flipped: plane.flipped, custom: plane.custom }, current), true, SECTION_VIEW_MS);
    return true;
  }
  cam.setPresetView?.(presetViewForAxis(plane.axis, plane.flipped));
  return true;
}

/** Zmení smer; vráti, ako dlho animuje (0 = hneď). */
function setDirection(state: State, msg: CameraMessage, step: CameraStep): number {
  const cam = state.cameraCallbacks;
  if (msg.viewpoint) {
    applyHostViewpoint(state, msg.viewpoint);
    return VIEWPOINT_MS;
  }
  switch (step.kind) {
    case 'home': cam.home?.(); return 500;
    case 'fit': cam.fitAll?.(); return 0;
    case 'preset': cam.setPresetView?.(step.view); return 300;
    case 'section': return lookAtSection(state) ? SECTION_VIEW_MS : 0;
    case 'keep': return 0;
  }
}

function frameTarget(msg: CameraMessage, bim: BimContext, g: TargetHelpers): void {
  const state = useViewerStore.getState();
  if (msg.guids?.length || msg.selector) {
    const refs = msg.guids?.length ? g.resolveGuids(state.models, msg.guids) : g.resolveSelector(state.models, msg.selector!);
    if (refs.length > 0) bim.viewer.flyTo(refs);
    else console.warn('[aim-bridge] SET_CAMERA: cieľ bez prvkov', msg.guids ?? msg.selector);
  } else if (msg.fit === 'visible') {
    state.cameraCallbacks.fitAll?.();
  } else if (msg.fit === 'selection') {
    state.cameraCallbacks.frameSelection?.();
  }
}

/**
 * Poradie: projekcia, smer, rámovanie. Rámovanie počíta pózu z aktuálneho
 * smeru, preto ide až po animácii smeru - spustené hneď prepísalo koncový bod
 * animácie a preset s cieľom kamerou nepohol (AIMviewer #65).
 */
export function runCamera(msg: CameraMessage, step: CameraStep, bim: BimContext, g: TargetHelpers): void {
  const token = ++latest;
  const state = useViewerStore.getState();
  if (msg.projection) state.setProjectionMode(msg.projection);
  const wait = setDirection(state, msg, step);
  if (!msg.guids?.length && !msg.selector && !msg.fit) return;
  const frame = () => {
    if (token === latest) frameTarget(msg, bim, g);
  };
  if (wait > 0) setTimeout(frame, wait + FRAME_SLACK_MS);
  else frame();
}

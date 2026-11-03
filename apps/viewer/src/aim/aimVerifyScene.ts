/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Scéna pri rozbalení overenia veličiny (AIM D-185 UI, pripomienky 2 a 4), lenivo z `aimVerify.ts`: rezný box
 * a kamera podľa druhu veličiny (`aimVerifyView.ts`), miestnosť sa v 3D odznačí (panel ostane na nej,
 * `selectedEntity` sa nemení), po zatvorení detailu sa vráti predošlý rez a projekcia. Overené naživo, viď
 * `docs/architecture/evidence/aim-d185-verify-ui/`.
 */

import { useViewerStore } from '@/store';
import { toGlobalIdFromModels } from '@/store/globalId';
import { sectionBoxFromBounds } from '@/lib/section/section-box';
import { resolveGuids } from './bridge-protocol.js';
import { useAimVerify } from './aimVerifyStore.js';
import { renderBoundsOfGuids } from './viewQueries.js';
import { spaceRoomBox } from './sectionBoxScene.js';
import { cameraPose, quantityKind, verifyViewPlan, type Box, type ViewOption } from './aimVerifyView.js';

type State = ReturnType<typeof useViewerStore.getState>;
type Plane = State['sectionPlane'];

/** Rez a projekcia pred prvým rozbalením; vrátia sa, keď sa zatvorí posledný detail (ak ich medzitým nikto nezmenil). */
let saved: { plane: Plane; projection: State['projectionMode'] } | null = null;
let ourBox: Plane['box'] | null = null;
/** Miestnosti skryté pohľadom (ich plochy by v reze prekryli scénu); po zatvorení sa ukážu. */
let hiddenRooms: number[] = [];
/** Druhá možnosť pohľadu (pre porovnanie so Samuelom): `?aimVerifyView=b` v adrese vieweru. */
const option = (): ViewOption => {
  try {
    return new URLSearchParams(window.location.search).get('aimVerifyView') === 'b' ? 'b' : 'a';
  } catch (err) {
    console.warn('[aim-verify] view option', err);
    return 'a';
  }
};

const boxOf = (state: State, guids: readonly string[]): Box | null =>
  renderBoundsOfGuids(state, guids, { resolveGuids } as Parameters<typeof renderBoundsOfGuids>[2]).union;

/** Globálne id všetkých miestností modelu (zmazané v relácii vynechané). */
function spaceIds(state: State, modelId: string): number[] {
  const store = modelId === 'legacy' ? state.ifcDataStore : state.models.get(modelId)?.ifcDataStore;
  const view = state.mutationViews.get(modelId);
  // @raw-entity-enumeration-ok IfcSpace of the file to hide while a quantity check is open; deleted ones skipped through the mutation view
  return (store?.entityIndex.byType.get('IFCSPACE') ?? []).filter((e) => !view?.isDeleted(e)).map((e) => toGlobalIdFromModels(state.models, modelId, e));
}

function showRooms(): void {
  if (hiddenRooms.length > 0) useViewerStore.getState().showEntities(hiddenRooms);
  hiddenRooms = [];
}

/** Orez a kamera pre veličinu `target` miestnosti `roomGuid` so vstupnými prvkami `inputs`. */
export function applyVerifyView(target: string, roomGuid: string, inputs: readonly string[]): void {
  const state = useViewerStore.getState();
  const ref = resolveGuids(state.models, [roomGuid])[0];
  const roomId = ref ? toGlobalIdFromModels(state.models, ref.modelId, ref.expressId) : null;
  const body = boxOf(state, [roomGuid]);
  const room = roomId !== null ? spaceRoomBox(roomId) : null;
  const inputBoxes = inputs.filter((g) => g !== roomGuid).map((g) => boxOf(state, [g])).filter((b): b is Box => b !== null);
  const plan = verifyViewPlan(quantityKind(target), room, body, inputBoxes, option());
  const section = plan && sectionBoxFromBounds(plan.box);
  if (!plan || !section) return;
  if (!saved) saved = { plane: state.sectionPlane, projection: state.projectionMode };
  // Telesá miestností sa v reze kreslia ako plné plochy cez celý pohľad (výber zapne triedu IfcSpace, farba
  // miestnosti prekryla podlahu aj steny): skryjú sa všetky vrátane overovanej, pôdorys ohraničia steny.
  showRooms();
  const fresh = useViewerStore.getState(); // showRooms zmenil hiddenEntities
  const rooms = ref ? spaceIds(fresh, ref.modelId).filter((id) => !fresh.hiddenEntities.has(id)) : [];
  if (rooms.length > 0) fresh.hideEntities(rooms);
  hiddenRooms = rooms;
  state.setSectionBox(section);
  ourBox = useViewerStore.getState().sectionPlane.box;
  const cam = state.cameraCallbacks;
  const vp = cam.getViewpoint?.();
  state.setProjectionMode(plan.projection);
  if (cam.applyViewpoint && vp) cam.applyViewpoint({ ...vp, ...cameraPose(plan), projectionMode: plan.projection }, false);
  void cam.frameBounds?.(plan.frame.min, plan.frame.max, { padding: 1.08, durationMs: 400 });
}

/**
 * Miestnosť sa v 3D odznačí (jej zvýraznenie prekrylo scénu), panel vlastností ostane na nej: `selectedEntity`
 * nesie panel aj most k hosťovi, `selectedEntityId` len výber v scéne (`useModelSelection` pri null nič nemaže).
 */
export function releaseSceneSelection(guid: string): void {
  const state = useViewerStore.getState();
  if (state.selectedEntityId === null && state.selectedEntityIds.size === 0) return;
  useAimVerify.setState({ pinned: guid });
  state.setSelectedEntityId(null);
  useViewerStore.setState({ selectedEntityIds: new Set() });
}

/** Detail zatvorený: vráti rez a projekciu spred overenia, ak box je stále náš. */
export function restoreVerifyView(): void {
  const s = saved;
  saved = null;
  showRooms();
  const box = ourBox;
  ourBox = null;
  if (!s) return;
  const state = useViewerStore.getState();
  if (state.sectionPlane.box === box) useViewerStore.setState({ sectionPlane: s.plane });
  if (state.projectionMode !== s.projection) state.setProjectionMode(s.projection);
}

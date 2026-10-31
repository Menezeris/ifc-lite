/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Prvky pod oblasťou pripomienky na PDF (AIM #199 bod 2): lepidlo k `docEntities.ts`. Z kalibrácie
 * strany (`underlayDrawings`) a obálok prvkov v rendereri zostaví návrh, vybrané prvky nastaví ako
 * výber v 3D (upstream formulár "New topic" ho zachytí do komponentov pohľadu témy) a po založení
 * témy doplní komponenty, ak ich formulár nezachytil. Načítava sa lenivo s kartou dokumentu.
 */

import { useViewerStore } from '@/store';
import { toGlobalIdFromModels } from '@/store/globalId';
import { resolveEntityRef } from '@/store/resolveEntityRef';
import { getGlobalRenderer } from '@/hooks/useBCF';
import { bcfWorldOffset } from '@/hooks/bcf/viewpoint-world-frame';
import { guidForEntity, resolveGuids } from './bridge-protocol.js';
import { addGlobalIdsToSelection } from './aimMultiSelect.js';
import { renderBoxToIfc } from './viewFrame.js';
import {
  entitiesUnderRegion,
  mergeGuids,
  regionToIfcPolygon,
  storeyBand,
  type EntityBox,
  type EntityCandidate,
  type EntityPlacement,
} from './docEntities.js';
import type { DocIssueTarget } from './docIssueModel.js';

/** Najviac GlobalId v `components` jednej témy (strop `view_state.bcf_local`). */
export const MAX_TOPIC_COMPONENTS = 600;

export type EntityProposal =
  | { status: 'ok'; candidates: EntityCandidate[]; total: number }
  /** Strana nemá kalibráciu: prvky sa vyberú ručne v 3D. */
  | { status: 'no-calibration' }
  /** Zvislý rez: návrh podľa pôdorysu nemá zmysel. */
  | { status: 'section' }
  /** Model alebo jeho geometria ešte nie je načítaná. */
  | { status: 'no-model' };

type State = ReturnType<typeof useViewerStore.getState>;

function placementOf(state: State, target: DocIssueTarget): (EntityPlacement & { page: number }) | 'section' | null {
  const p = state.underlayDrawings.get(target.docId)?.placement ?? null;
  if (!p || p.page !== target.page) {
    // Rez má viac kalibrácií na jeden dokument: záznamy s rovinou a touto stranou.
    for (const d of state.underlayDrawings.values()) {
      if (d.placement?.plane && d.placement.page === target.page && d.id.toLowerCase().startsWith(target.docId.toLowerCase())) return 'section';
    }
    return null;
  }
  return p.plane ? 'section' : { affine: p.affine, pageSize: p.pageSize, storeyZ: p.storeyZ, page: p.page };
}

/** Obálky všetkých prvkov modelov v IFC metroch (Z hore) s GlobalId, triedou a názvom. */
function elementBoxes(state: State): EntityBox[] | null {
  const scene = getGlobalRenderer()?.getScene();
  if (!scene) return null;
  const offset = bcfWorldOffset(state.models, state.geometryResult);
  const parts: (readonly { expressId: number; ifcType?: string }[])[] = [];
  for (const model of state.models.values()) if (model.geometryResult?.meshes) parts.push(model.geometryResult.meshes);
  if (state.models.size === 0 && state.geometryResult?.meshes) parts.push(state.geometryResult.meshes);
  const out: EntityBox[] = [];
  const done = new Set<number>();
  for (const part of parts) {
    for (const mesh of part) {
      if (done.has(mesh.expressId)) continue;
      done.add(mesh.expressId);
      const box = scene.getEntityBoundingBox(mesh.expressId);
      if (!box) continue;
      const ref = resolveEntityRef(mesh.expressId);
      const guid = guidForEntity(state.models, ref);
      if (!guid) continue;
      const ifc = renderBoxToIfc(box, offset);
      const store = state.models.get(ref.modelId)?.ifcDataStore;
      out.push({
        guid,
        ifcType: mesh.ifcType ?? store?.entities.getTypeName(ref.expressId) ?? '',
        name: store?.entities.getName(ref.expressId) ?? '',
        min: ifc.min,
        max: ifc.max,
      });
    }
  }
  return out;
}

/** Návrh prvkov pod oblasťou cieľa podľa kalibrácie strany. */
export function proposeEntities(target: DocIssueTarget): EntityProposal {
  const state = useViewerStore.getState();
  const placement = placementOf(state, target);
  if (placement === 'section') return { status: 'section' };
  if (!placement) return { status: 'no-calibration' };
  const poly = regionToIfcPolygon(placement, target.region);
  if (!poly) return { status: 'no-calibration' };
  const boxes = elementBoxes(state);
  if (!boxes || boxes.length === 0) return { status: 'no-model' };
  const others = [...state.underlayDrawings.values()].flatMap((d) => (d.placement && !d.placement.plane ? [d.placement.storeyZ] : []));
  return { status: 'ok', ...entitiesUnderRegion(boxes, poly, storeyBand(placement.storeyZ, others)) };
}

/** GlobalId prvkov, ktoré má používateľ práve vybrané v 3D (ručný výber). */
export function selectedGuids(): string[] {
  const state = useViewerStore.getState();
  const guids: string[] = [];
  for (const key of state.selectedEntitiesSet) {
    const at = key.lastIndexOf(':');
    const guid = guidForEntity(state.models, { modelId: key.slice(0, at), expressId: Number(key.slice(at + 1)) });
    if (guid) guids.push(guid);
  }
  if (!guids.length && state.selectedEntity) {
    const guid = guidForEntity(state.models, state.selectedEntity);
    if (guid) guids.push(guid);
  }
  return mergeGuids(guids, [], MAX_TOPIC_COMPONENTS);
}

/**
 * Výber v 3D nahradí týmito prvkami: formulár "New topic" zachytí výber do pohľadu témy.
 * Vráti GlobalId, ktoré sa našli v načítaných modeloch.
 */
export function selectGuidsIn3d(guids: readonly string[]): string[] {
  const state = useViewerStore.getState();
  const refs = resolveGuids(state.models, guids);
  state.clearSelection();
  addGlobalIdsToSelection(refs.map((r) => toGlobalIdFromModels(state.models, r.modelId, r.expressId)));
  return refs.flatMap((r) => guidForEntity(state.models, r) ?? []);
}

/**
 * Prvý pohľad témy, ktorý ešte nemá všetky vybrané prvky v `components.selection`, ich doplní.
 * Téma bez pohľadu (formulár bez snímky) komponenty nenesie: vráti false.
 */
export function ensureTopicComponents(topicGuid: string, guids: readonly string[]): boolean {
  if (!guids.length) return true;
  const store = useViewerStore.getState();
  const topic = store.bcfProject?.topics.get(topicGuid);
  const vp = topic?.viewpoints[0];
  if (!topic || !vp) return false;
  const have = (vp.components?.selection ?? []).map((c) => c.ifcGuid).filter((g): g is string => typeof g === 'string');
  const all = mergeGuids(have, guids, MAX_TOPIC_COMPONENTS);
  if (all.length === have.length) return true;
  const known = new Map((vp.components?.selection ?? []).map((c) => [c.ifcGuid, c] as const));
  const selection = all.map((g) => known.get(g) ?? { ifcGuid: g });
  const viewpoints = topic.viewpoints.map((v, i) => (i === 0 ? { ...v, components: { ...v.components, selection } } : v));
  store.updateTopic(topicGuid, { viewpoints });
  return true;
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Bridge messages of the AIM derivations layer (D-089 phase B): the layer the
 * host pushes after MODELS_LOADED and on every change (AIM_DERIVATIONS_LOAD),
 * and the derived relations of the selected element that ride on
 * AIM_PANEL_DATA (`derivedRelations` / `derivedTotal`). Its own file like
 * `view-protocol.ts`, because `bridge-protocol.ts` sits at its module-size
 * budget. Mirror of the host types in the AIM repo (`lib/derivations.ts`).
 */

import { SOURCE } from './bridge-core.js';

/**
 * One derivation rule of the AIM layer (D-089, host `derivation_rules`) with
 * its state for the AIM ribbon tab and the AIM layers panel.
 * `enabled` / `mode` are display-only here: changing them is a data change
 * done at `manageUrl` until the viewer may write (phase 3).
 */
export interface DerivationRuleWire {
  id: string;
  name: string;
  kind: 'geometry' | 'via_space';
  enabled: boolean;
  mode: 'auto' | 'manual';
  /** IFC classes of the targets (IfcSpace, IfcSpatialZone, IfcZone). */
  targetClasses: string[];
  roles: string[];
  /** Active relations of the rule. */
  count: number;
  lastRun: { at: string; status: string; written: number; closed: number } | null;
}

/** Current revision of one federation model (D-086); `model` = file name without extension. */
export interface ModelRevisionWire {
  model: string;
  revision: number;
}

/** The AIM layer over the models (D-089), pushed after MODELS_LOADED and on every change. */
export interface DerivationsLayerWire {
  version: 1;
  rules: DerivationRuleWire[];
  models: ModelRevisionWire[];
  /** Where rules are managed (enable, disable, recompute) until the viewer may write. */
  manageUrl?: string;
}

/**
 * One derived relation of the selected element. `outgoing` = the selected
 * element lies in the target (element -> space/zone), `incoming` = the
 * selected element is the target (zone <- elements). `ifcRelation` is null
 * for the via-space rule (IfcZone), where `viaSpaceRef` names the space.
 */
export interface DerivedRelationWire {
  ruleId: string;
  ruleName: string;
  ifcRelation: 'IfcRelReferencedInSpatialStructure' | null;
  direction: 'outgoing' | 'incoming';
  role: string | null;
  other: {
    objectId: string;
    guid: string | null;
    ref: string | null;
    name: string | null;
    ifcType: string | null;
    /** IFC PredefinedType of the other end (THERMAL, FIRESAFETY...), groups the panel tree (D-106). */
    predefinedType?: string | null;
  };
  viaSpaceRef?: string | null;
}

/**
 * Per-element AIM badge counts for the hierarchy tree (D-077), keyed by IFC
 * GlobalId. Compact single-letter fields keep the payload small across the
 * whole model: d = linked documents, r = responsibilities, c = captures.
 * A missing field means zero.
 */
export interface AimTreeDecoration {
  d?: number;
  r?: number;
  c?: number;
}

export interface DerivationsLoadMessage {
  source: typeof SOURCE;
  type: 'AIM_DERIVATIONS_LOAD';
  layer: DerivationsLayerWire;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}

function isFiniteNonNegative(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function isDerivationRuleWire(v: unknown): v is DerivationRuleWire {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id.length === 0) return false;
  if (typeof r.name !== 'string') return false;
  if (r.kind !== 'geometry' && r.kind !== 'via_space') return false;
  if (typeof r.enabled !== 'boolean') return false;
  if (r.mode !== 'auto' && r.mode !== 'manual') return false;
  if (!isStringArray(r.targetClasses) || !isStringArray(r.roles)) return false;
  if (!isFiniteNonNegative(r.count)) return false;
  if (r.lastRun !== null) {
    const run = r.lastRun as Record<string, unknown> | undefined;
    if (!run || typeof run !== 'object') return false;
    if (typeof run.at !== 'string' || typeof run.status !== 'string') return false;
    if (!isFiniteNonNegative(run.written) || !isFiniteNonNegative(run.closed)) return false;
  }
  return true;
}

function isModelRevisionWire(v: unknown): v is ModelRevisionWire {
  if (!v || typeof v !== 'object') return false;
  const m = v as { model?: unknown; revision?: unknown };
  return typeof m.model === 'string' && m.model.length > 0 && isFiniteNonNegative(m.revision);
}

/**
 * The derivations layer is an all-or-nothing host push like the decorations:
 * a malformed rule rejects the message. An unknown `version` is rejected too,
 * so a newer host never feeds a shape this viewer does not understand; the
 * viewer then simply keeps working without the layer.
 */
export function isDerivationsLayerWire(v: unknown): v is DerivationsLayerWire {
  if (!v || typeof v !== 'object') return false;
  const l = v as { version?: unknown; rules?: unknown; models?: unknown; manageUrl?: unknown };
  if (l.version !== 1) return false;
  if (!Array.isArray(l.rules) || !l.rules.every(isDerivationRuleWire)) return false;
  if (!Array.isArray(l.models) || !l.models.every(isModelRevisionWire)) return false;
  if (l.manageUrl !== undefined && typeof l.manageUrl !== 'string') return false;
  return true;
}

function isNullableString(v: unknown): v is string | null {
  return v === null || typeof v === 'string';
}

function isDerivedRelationWire(v: unknown): v is DerivedRelationWire {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  if (typeof r.ruleId !== 'string' || typeof r.ruleName !== 'string') return false;
  if (r.ifcRelation !== null && r.ifcRelation !== 'IfcRelReferencedInSpatialStructure') return false;
  if (r.direction !== 'outgoing' && r.direction !== 'incoming') return false;
  if (!isNullableString(r.role)) return false;
  if (r.viaSpaceRef !== undefined && !isNullableString(r.viaSpaceRef)) return false;
  const o = r.other as Record<string, unknown> | undefined;
  if (!o || typeof o !== 'object' || typeof o.objectId !== 'string') return false;
  if (o.predefinedType !== undefined && !isNullableString(o.predefinedType)) return false;
  return isNullableString(o.guid) && isNullableString(o.ref) && isNullableString(o.name) && isNullableString(o.ifcType);
}

/**
 * Derived relations of an AIM_PANEL_DATA payload, malformed entries dropped.
 * The panel envelope check stays lenient (the card is a generic render
 * schema), so this is where the typed D-089 field is narrowed: one bad row
 * must not take the whole Relationship records group down.
 */
export function derivedRelationsOf(data: {
  derivedRelations?: unknown;
  derivedTotal?: unknown;
}): { relations: DerivedRelationWire[]; total: number } {
  const raw = data.derivedRelations;
  const relations = Array.isArray(raw) ? raw.filter(isDerivedRelationWire) : [];
  const total = isFiniteNonNegative(data.derivedTotal) ? Math.max(data.derivedTotal, relations.length) : relations.length;
  return { relations, total };
}

/** AIM_DERIVATIONS_LOAD with a valid layer; anything else is not handled here. */
export function isDerivationsMessage(data: unknown): data is DerivationsLoadMessage {
  if (!data || typeof data !== 'object') return false;
  const msg = data as { source?: unknown; type?: unknown; layer?: unknown };
  return msg.source === SOURCE && msg.type === 'AIM_DERIVATIONS_LOAD' && isDerivationsLayerWire(msg.layer);
}

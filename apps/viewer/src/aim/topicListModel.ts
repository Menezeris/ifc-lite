/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Zoznam tém s filtrami (AIM #199, bod 3): čistá logika bez store a DOM. Filtre
 * zrkadlia `bcf_topic_list` hosta (context 3d|pdf|both|none, entity, document)
 * a počítajú sa nad témami, ktoré panel BCF už má (BCF API hosta + lokálne
 * neuložené). Entita sa porovnáva s GlobalId vo výbere pohľadu témy; rodičov
 * entity (podlažie, projekt) rozloží až host, tu je to priama zhoda.
 */

import type { BCFTopic } from '@ifc-lite/bcf';
import { topicDocTargets, type DocIssueTarget } from './docIssueModel.js';

export type TopicContext = 'all' | '3d' | 'pdf' | 'both' | 'none';

export interface TopicFilter {
  context: TopicContext;
  /** GlobalId (alebo jeho začiatok), prázdne = bez filtra. */
  entity: string;
  /** Id dokumentu AIM, prázdne = bez filtra. */
  document: string;
  /** Len témy bez väzby na entitu (celý projekt). */
  projectOnly: boolean;
}

export const EMPTY_TOPIC_FILTER: TopicFilter = { context: 'all', entity: '', document: '', projectOnly: false };

export const isFilterActive = (f: TopicFilter): boolean =>
  f.context !== 'all' || f.entity.trim() !== '' || f.document !== '' || f.projectOnly;

/** Pohľad s kamerou = 3D kontext (snímka PDF bez kamery z hosta sa nepočíta). */
export function topicHas3d(topic: BCFTopic): boolean {
  return topic.viewpoints.some((v) => v.perspectiveCamera || v.orthogonalCamera);
}

export function topicHasPdf(topic: BCFTopic): boolean {
  return topicDocTargets(topic).length > 0;
}

/** GlobalId z výberu pohľadov témy (entity, na ktoré sa téma viaže). */
export function topicEntityGuids(topic: BCFTopic): string[] {
  const out = new Set<string>();
  for (const vp of topic.viewpoints) {
    for (const c of vp.components?.selection ?? []) if (c.ifcGuid) out.add(c.ifcGuid);
  }
  return [...out];
}

function contextMatches(topic: BCFTopic, ctx: TopicContext): boolean {
  if (ctx === 'all') return true;
  const has3d = topicHas3d(topic);
  const hasPdf = topicHasPdf(topic);
  if (ctx === '3d') return has3d;
  if (ctx === 'pdf') return hasPdf;
  if (ctx === 'both') return has3d && hasPdf;
  return !has3d && !hasPdf;
}

export function filterTopics(topics: readonly BCFTopic[], f: TopicFilter): BCFTopic[] {
  const entity = f.entity.trim().toLowerCase();
  return topics.filter((t) => {
    if (!contextMatches(t, f.context)) return false;
    if (f.document && !topicDocTargets(t).some((d) => d.docId.toLowerCase() === f.document.toLowerCase())) return false;
    const guids = topicEntityGuids(t);
    if (entity && !guids.some((g) => g.toLowerCase().startsWith(entity))) return false;
    if (f.projectOnly && guids.length > 0) return false;
    return true;
  });
}

/** Dokumenty, na ktoré témy odkazujú (pre výber filtra), s počtom tém. */
export function documentOptions(topics: readonly BCFTopic[]): { docId: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of topics) {
    for (const id of new Set(topicDocTargets(t).map((d) => d.docId))) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts].map(([docId, count]) => ({ docId, count })).sort((a, b) => a.docId.localeCompare(b.docId));
}

export type TopicOpenAction =
  | { kind: '3d'; viewpointGuid: string }
  | { kind: 'pdf'; target: DocIssueTarget }
  | null;

/** Čo otvorí klik na tému: 3D pohľad (prvý s kamerou), inak strana dokumentu s výrezom, inak nič. */
export function topicOpenAction(topic: BCFTopic): TopicOpenAction {
  const vp = topic.viewpoints.find((v) => v.perspectiveCamera || v.orthogonalCamera);
  if (vp) return { kind: '3d', viewpointGuid: vp.guid };
  const target = topicDocTargets(topic)[0];
  return target ? { kind: 'pdf', target } : null;
}

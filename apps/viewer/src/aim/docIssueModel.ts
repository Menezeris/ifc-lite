/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Pripomienky na PDF (AIM D-158): čistá logika bez store a DOM. Pripomienka je
 * obyčajná BCF téma panela (upstream "New topic") s BCF DocumentReference na
 * stranu a oblasť dokumentu AIM. Odkaz má ten istý tvar ako BCF API hosta
 * (`<host>/drawing/<id>?page=N&region=x_y_w_h#page=N`, oblasť v %), takže ho
 * host pri uložení z chatu rozloží späť a export `.bcfzip` ho nesie ďalej.
 */

import type { BCFDocumentReference, BCFProject, BCFTopic, BCFViewpoint } from '@ifc-lite/bcf';

/** Oblasť strany v zlomkoch (0-1), počiatok vľavo hore (ako `DocRegion`). */
export interface IssueRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DocIssueTarget {
  docId: string;
  page: number;
  region: IssueRegion | null;
}

/** Ťah menší než toto (zlomok strany) je klik, nie oblasť. */
export const MIN_DRAG = 0.005;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const pct = (v: number) => +(v * 100).toFixed(2);

/** Obdĺžnik z dvoch bodov ťahu (px v okne) nad stranou `page` (jej obdĺžnik v okne); null = klik. */
export function regionFromDrag(
  page: { left: number; top: number; width: number; height: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): IssueRegion | null {
  if (page.width <= 0 || page.height <= 0) return null;
  const fx = (x: number) => clamp01((x - page.left) / page.width);
  const fy = (y: number) => clamp01((y - page.top) / page.height);
  const x0 = Math.min(fx(a.x), fx(b.x));
  const x1 = Math.max(fx(a.x), fx(b.x));
  const y0 = Math.min(fy(a.y), fy(b.y));
  const y1 = Math.max(fy(a.y), fy(b.y));
  if (x1 - x0 < MIN_DRAG || y1 - y0 < MIN_DRAG) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Odkaz na stranu vo vieweri hosta; bez originu relatívny (host ho prijme aj tak). */
export function docIssueUrl(origin: string | null, t: DocIssueTarget): string {
  const q = new URLSearchParams({ page: String(t.page) });
  if (t.region) q.set('region', [t.region.x, t.region.y, t.region.w, t.region.h].map(pct).join('_'));
  return `${origin ?? ''}/drawing/${t.docId}?${q.toString()}#page=${t.page}`;
}

/** Odkaz z DocumentReference -> dokument, strana a oblasť; null = nie je to odkaz AIM. */
export function parseDocIssueUrl(url: string | undefined): DocIssueTarget | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url, 'https://aim.invalid');
  } catch {
    return null;
  }
  const m = /^\/drawing\/([^/]+)\/?$/.exec(u.pathname);
  if (!m || !UUID.test(m[1])) return null;
  const page = Number(u.searchParams.get('page') ?? u.hash.replace(/^#page=/, ''));
  if (!Number.isInteger(page) || page < 1) return null;
  const parts = (u.searchParams.get('region') ?? '').split('_').map(Number);
  const ok = parts.length === 4 && parts.every((v) => Number.isFinite(v)) && parts[2] > 0 && parts[3] > 0;
  const region = ok
    ? { x: clamp01(parts[0] / 100), y: clamp01(parts[1] / 100), w: clamp01(parts[2] / 100), h: clamp01(parts[3] / 100) }
    : null;
  return { docId: m[1].toLowerCase(), page, region };
}

/** Čitateľný opis odkazu (BCF Description; v exporte ho uvidia aj iné nástroje). */
export function docIssueLabel(docName: string, t: DocIssueTarget): string {
  const parts = [docName, `strana ${t.page}`];
  if (t.region) {
    const f = (v: number) => `${pct(v)}`.replace('.', ',');
    parts.push(`oblasť x ${f(t.region.x)} %, y ${f(t.region.y)} %, ${f(t.region.w)} x ${f(t.region.h)} %`);
  }
  return parts.join(', ');
}

/** BCF DocumentReference pre 2.1 (`referencedDocument`, externý) aj 3.0 (`url`). */
export function docIssueReference(origin: string | null, docName: string, t: DocIssueTarget): BCFDocumentReference {
  const url = docIssueUrl(origin, t);
  return { url, referencedDocument: url, isExternal: true, description: docIssueLabel(docName, t) };
}

/** Odkazy témy na dokument AIM. */
export function topicDocTargets(topic: BCFTopic): DocIssueTarget[] {
  const out: DocIssueTarget[] = [];
  for (const ref of topic.documentReferences ?? []) {
    const t = parseDocIssueUrl(ref.url ?? ref.referencedDocument);
    if (t) out.push(t);
  }
  return out;
}

export interface PageIssue {
  guid: string;
  /** Číslo na rámiku: "#N" z hosta, inak poradie neuloženej témy. */
  label: string;
  title: string;
  region: IssueRegion | null;
  saved: boolean;
}

/** Pripomienky na strane dokumentu (rámiky nad stranou). */
export function issuesOnPage(project: BCFProject | null, docId: string, page: number): PageIssue[] {
  if (!project) return [];
  const out: PageIssue[] = [];
  let local = 0;
  for (const topic of project.topics.values()) {
    const saved = typeof topic.index === 'number';
    if (!saved) local += 1;
    for (const t of topicDocTargets(topic)) {
      if (t.docId !== docId.toLowerCase() || t.page !== page) continue;
      out.push({ guid: topic.guid, label: saved ? `#${topic.index}` : `N${local}`, title: topic.title, region: t.region, saved });
    }
  }
  return out;
}

/** Prvá téma projektu, ktorá nebola v `before` (téma, ktorú práve založil upstream formulár). */
export function newTopicGuid(before: ReadonlySet<string>, project: BCFProject | null): string | null {
  for (const guid of project?.topics.keys() ?? []) if (!before.has(guid)) return guid;
  return null;
}

/** Témy, ktoré host ešte nemá: v projekte AIM bez čísla (`index`) z BCF API hosta. */
export function isLocalTopic(topic: BCFTopic): boolean {
  return typeof topic.index !== 'number';
}

/** Najviac GlobalId výberu jednej témy vo `view_state` (strop mosta). */
export const MAX_LOCAL_SELECTION = 600;
/** Najviac lokálnych tém vo `view_state`. */
export const MAX_LOCAL_TOPICS = 50;

const xyz = (p: { x: number; y: number; z: number }) => ({ x: p.x, y: p.y, z: p.z });

/** Pohľad v tvare BCF API (snake_case, ako `viewpointToApi`), bez snímky; host ho uloží ako pohľad z panela. */
export function viewpointDto(vp: BCFViewpoint): Record<string, unknown> {
  const dto: Record<string, unknown> = { guid: vp.guid };
  const cam = (c: { cameraViewPoint: { x: number; y: number; z: number }; cameraDirection: { x: number; y: number; z: number }; cameraUpVector: { x: number; y: number; z: number } }) => ({
    camera_view_point: xyz(c.cameraViewPoint),
    camera_direction: xyz(c.cameraDirection),
    camera_up_vector: xyz(c.cameraUpVector),
  });
  if (vp.perspectiveCamera) dto.perspective_camera = { ...cam(vp.perspectiveCamera), field_of_view: vp.perspectiveCamera.fieldOfView };
  if (vp.orthogonalCamera) dto.orthogonal_camera = { ...cam(vp.orthogonalCamera), view_to_world_scale: vp.orthogonalCamera.viewToWorldScale };
  if (vp.clippingPlanes?.length) {
    dto.clipping_planes = vp.clippingPlanes.map((p) => ({ location: xyz(p.location), direction: xyz(p.direction) }));
  }
  const selection = (vp.components?.selection ?? []).map((c) => c.ifcGuid).filter((g): g is string => typeof g === 'string' && g !== '');
  if (selection.length) {
    dto.components = { selection: selection.slice(0, MAX_LOCAL_SELECTION).map((g) => ({ ifc_guid: g })) };
  }
  return dto;
}

/**
 * Lokálne (neuložené) témy projektu AIM pre `view_state.bcf_local`: chat ich na
 * pokyn uloží do DB hosta (`bcf_topic action=from_viewer`) s tým istým guid.
 * Projekt iný než AIM (súbor, vlastný server) sa nevypisuje.
 */
export function describeLocalTopics(project: BCFProject | null, aimProjectId: string | null) {
  if (!project || !aimProjectId || project.projectId !== aimProjectId) return { count: 0, topics: [] };
  const local = [...project.topics.values()].filter(isLocalTopic);
  return {
    count: local.length,
    topics: local.slice(0, MAX_LOCAL_TOPICS).map((t) => ({
      guid: t.guid,
      title: t.title,
      description: t.description ?? null,
      topic_type: t.topicType ?? null,
      topic_status: t.topicStatus ?? null,
      priority: t.priority ?? null,
      assigned_to: t.assignedTo ?? null,
      due_date: t.dueDate ?? null,
      labels: t.labels ?? [],
      creation_author: t.creationAuthor ?? null,
      creation_date: t.creationDate ?? null,
      comments: t.comments.map((c) => ({ author: c.author ?? null, date: c.date ?? null, comment: c.comment })),
      viewpoint: t.viewpoints[0] ? viewpointDto(t.viewpoints[0]) : null,
      document_references: (t.documentReferences ?? []).map((d) => ({
        url: d.url ?? d.referencedDocument ?? null,
        description: d.description ?? null,
      })),
    })),
  };
}

/**
 * Nový projekt AIM z hosta a doteraz otvorený projekt -> čo dať do panela.
 * Témy z hosta sa nahradia (aj tie, ktoré chat medzitým uložil z lokálnych:
 * rovnaký guid, žiadna duplicita), lokálne neuložené ostanú. Projekt
 * používateľa (súbor, server, iné projectId) sa nemení: null.
 */
export function mergeAimProject(current: BCFProject | null, fresh: BCFProject, previous: BCFProject | null): BCFProject | null {
  if (current === null || current === previous || current.topics.size === 0) return fresh;
  if (!previous || !fresh.projectId || current.projectId !== fresh.projectId) return null;
  const topics = new Map(fresh.topics);
  for (const [guid, topic] of current.topics) {
    if (isLocalTopic(topic) && !topics.has(guid)) topics.set(guid, topic);
  }
  return { ...fresh, topics };
}

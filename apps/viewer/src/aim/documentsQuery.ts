/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Documents panel queries (D-104 step 3 in the AIM repo): grouping by the
 * host's folder path or by any `meta` key the host sent, metadata search and
 * the effective documents of the selection. Pure; the panel only renders.
 *
 * The viewer holds no list of metadata fields: the keys come from the
 * documents themselves. A `meta` value with `; ` carries several values (a
 * floor plan of 4NP and 5NP) and the document appears in each group.
 */

/** The document fields these queries read (structurally a `ViewerDocument`). */
export interface QueryDocument {
  id: string;
  name: string;
  folder?: readonly string[];
  meta?: Readonly<Record<string, string>>;
}

/** Id prefix of a document the user opened from disk (not sent by the host). */
export const LOCAL_DOCUMENT_PREFIX = 'local:';

/** Group by the host's folder path (default) or by a `meta` key. */
export const GROUP_BY_FOLDER = '';

/** Separator of several values in one `meta` value. */
export const META_VALUES_SEPARATOR = '; ';

/** Lowercase without diacritics, so "podorys" finds "Pôdorys". */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** `meta` keys present on at least one document, in first-seen order. */
export function metaKeys(docs: Iterable<QueryDocument>): string[] {
  const keys = new Set<string>();
  for (const doc of docs) for (const [key, value] of Object.entries(doc.meta ?? {})) if (value) keys.add(key);
  return [...keys];
}

/** Every word of the filter is in the name, folder or a `meta` value. */
export function matchesFilter(doc: QueryDocument, filter: string): boolean {
  const words = foldText(filter).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = foldText([doc.name, ...(doc.folder ?? []), ...Object.values(doc.meta ?? {})].join(' '));
  return words.every((word) => haystack.includes(word));
}

function groupLabels(doc: QueryDocument, groupBy: string): string[] {
  if (groupBy === GROUP_BY_FOLDER) return [doc.folder && doc.folder.length > 0 ? doc.folder.join(' / ') : ''];
  const value = doc.meta?.[groupBy];
  if (!value) return [''];
  return [...new Set(value.split(META_VALUES_SEPARATOR).map((v) => v.trim()).filter(Boolean))];
}

/**
 * Documents matching the filter, grouped. Named groups first (natural order, so
 * 2NP comes before 10NP), the catch-all '' last; documents by name in a group.
 */
export function groupDocuments<D extends QueryDocument>(
  docs: Iterable<D>,
  { filter = '', groupBy = GROUP_BY_FOLDER }: { filter?: string; groupBy?: string } = {},
): [string, D[]][] {
  const byGroup = new Map<string, D[]>();
  for (const doc of docs) {
    if (!matchesFilter(doc, filter)) continue;
    for (const label of groupLabels(doc, groupBy)) {
      const list = byGroup.get(label);
      if (list) list.push(doc);
      else byGroup.set(label, [doc]);
    }
  }
  const collator = new Intl.Collator('sk', { numeric: true });
  for (const list of byGroup.values()) list.sort((a, b) => collator.compare(a.name, b.name));
  return [...byGroup.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : collator.compare(a, b)));
}

/**
 * One document of the AIM card (`AimPanelData.documents`). `documentId`, `page`
 * and `via` (D-104) are optional: with them the viewer opens the PDF itself at
 * the page, without them the row navigates the host to `href` as before.
 */
export interface AimCardDocumentWire {
  name: string;
  href: string;
  badge?: string;
  /** Id of the document in DOCUMENTS_LOAD. */
  documentId?: string;
  /** 1-based page (a reference to a part of the document). */
  page?: number;
  /** How the element reaches the document, e.g. "cez zónu NJ - 3NP". */
  via?: string;
  /** AIM D-129: inherited through zone, storey, group... (an AIM layer, not in IFC). */
  aim?: boolean;
}

export interface SelectionDocument<D extends QueryDocument> {
  key: string;
  name: string;
  /** The library entry, when the host sent this document in DOCUMENTS_LOAD. */
  doc: D | null;
  page?: number;
  via?: string;
  /** AIM layer (D-129): shown with an AIM badge. */
  aim?: boolean;
  href: string;
}

/**
 * The AIM card's documents of the selected element joined with the library:
 * filtered like the library (name, via and the library entry's metadata).
 */
export function selectionDocuments<D extends QueryDocument>(
  cardDocuments: readonly AimCardDocumentWire[] | undefined,
  library: ReadonlyMap<string, D>,
  filter = '',
): SelectionDocument<D>[] {
  const out: SelectionDocument<D>[] = [];
  (cardDocuments ?? []).forEach((entry, index) => {
    const doc = entry.documentId ? library.get(entry.documentId) ?? null : null;
    const probe: QueryDocument = {
      id: entry.documentId ?? entry.href,
      name: [entry.name, entry.via ?? ''].join(' '),
      folder: doc?.folder,
      meta: doc?.meta,
    };
    if (!matchesFilter(probe, filter)) return;
    out.push({
      key: `${entry.documentId ?? entry.href}:${entry.page ?? ''}:${index}`,
      name: doc?.name ?? entry.name,
      doc,
      ...(entry.page ? { page: entry.page } : {}),
      ...(entry.via ? { via: entry.via } : {}),
      ...(entry.aim === true ? { aim: true } : {}),
      href: entry.href,
    });
  });
  return out;
}

/**
 * Payload of DOCUMENT_SHOW_3D for an open document: only host documents (a file
 * opened locally has no elements in the host's graph), the page only when it is
 * a real 1-based page. The host falls back to the whole document when the page
 * has no elements of its own.
 */
export function show3dTarget(documentId: string, page: number | undefined): { documentId: string; page?: number } | null {
  if (!documentId || documentId.startsWith(LOCAL_DOCUMENT_PREFIX)) return null;
  return page && Number.isInteger(page) && page >= 1 ? { documentId, page } : { documentId };
}

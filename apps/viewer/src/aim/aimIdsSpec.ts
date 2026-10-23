/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Beh jednej špecifikácie IDS z chatu (D-162): hľadanie špecifikácie podľa identifikátora, názvu alebo
 * id a dokument zúžený na ňu. Čisté funkcie bez importov (používa ich aj `useIDS` vo vstupnom balíku).
 */

interface SpecLike { id: string; name: string; identifier?: string }
interface DocLike<S extends SpecLike> { specifications: S[] }

/** Identifikátor má prednosť pred názvom a id; porovnanie bez ohľadu na veľkosť písmen a okrajové medzery. */
export function findSpecification<S extends SpecLike>(doc: DocLike<S>, key: string): S | undefined {
  const want = key.trim().toLowerCase();
  if (!want) return undefined;
  const by = (pick: (s: S) => string | undefined) => doc.specifications.find((s) => pick(s)?.trim().toLowerCase() === want);
  return by((s) => s.identifier) ?? by((s) => s.name) ?? by((s) => s.id);
}

/** Dokument len s jednou špecifikáciou; bez `specId` pôvodný dokument. */
export function onlySpecification<S extends SpecLike, D extends DocLike<S>>(doc: D, specId: string | undefined): D {
  if (specId === undefined) return doc;
  return { ...doc, specifications: doc.specifications.filter((s) => s.id === specId) };
}

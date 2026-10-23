/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Kanál na hosta pre IDS (D-162): jediná časť, ktorú potrebujú aj moduly vo vstupnom balíku (`AimBridge`
 * ho naplní, panely IDS rozhodnú podľa `isIdsHostEmbedded`). Všetko ostatné je v lenivých `aimIds*`.
 */

type Post = (msg: Record<string, unknown>) => void;

let post: Post | null = null;

/** `AimBridge` nastaví kanál pri pripojení mosta a zruší ho pri odpojení. */
export const setIdsHostPost = (next: Post | null): void => { post = next; };
export const idsHostPost = (): Post | null => post;

/** Viewer beží v iframe hosta (tlačidlo "Uložiť do AIM" a načítanie z AIM majú zmysel len tam). */
export const isIdsHostEmbedded = (): boolean => typeof window !== 'undefined' && window.parent !== window;

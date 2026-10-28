/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Kanál pre `view_state.clash_local` (D-164): jediná časť, ktorú potrebuje vstupný balík (`viewQueries`).
 * Opis zostaví lenivý `aimClashStore` a zaregistruje ho pri načítaní; kým sa nenačíta, clash z AIM neexistuje.
 */

let describe: (() => Record<string, unknown> | undefined) | null = null;

export const setClashLocalDescriber = (next: () => Record<string, unknown> | undefined): void => { describe = next; };
export const clashLocal = (): Record<string, unknown> | undefined => describe?.();

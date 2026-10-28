/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Stav uloženia IDS po odpojení mosta (D-162): rozpracované uloženie sa zruší (potvrdenie od hosta už
 * nepríde, tlačidlo "Uložiť do AIM" by zostalo vypnuté), hotový výsledok ostáva viditeľný. Čistá funkcia
 * bez importov, aby ju šlo skúšať bez viewera.
 */

export function statusAfterDisconnect<S extends { kind: string }>(status: S | null): S | null {
  return status?.kind === 'saving' ? null : status;
}

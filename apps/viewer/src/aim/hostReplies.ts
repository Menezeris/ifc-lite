/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Odpovede hosta na žiadosti vieweru, ktoré prichádzajú mimo brány príkazov (hneď): knižnica požiadaviek
 * (`REQLIB_RESULT`, D-182) a overenie výmer (`VERIFY_RESULT`, D-185 UI). Tvar overujú lenivé moduly. Tu aj
 * napojenie overenia výmer na výber prvku, aby `AimBridge.tsx` ostal pod limitom veľkosti modulu.
 */

import { SOURCE } from './bridge-core.js';
import { setVerifyFocus, useAimVerify } from './aimVerifyStore.js';

let reqlib: Promise<typeof import('./aimReqlib.js')> | null = null;
const loadReqlib = () => (reqlib ??= import('./aimReqlib.js'));
let verify: Promise<typeof import('./aimVerify.js')> | null = null;
const loadVerify = () => (verify ??= import('./aimVerify.js'));

const typed = (d: unknown, type: string) => !!d && typeof d === 'object' && (d as { source?: unknown }).source === SOURCE && (d as { type?: unknown }).type === type;

/** Odpoveď hosta na žiadosť karty, lišty IDS, panela výmer alebo ribbonu; `true` = správa patrila sem. */
export function hostReply(raw: unknown): boolean {
  if (typed(raw, 'REQLIB_RESULT')) {
    void loadReqlib().then((m) => m.handleReqlibResult(raw)).catch((err) => console.warn('[aim-bridge] REQLIB_RESULT failed', err));
    return true;
  }
  if (typed(raw, 'VERIFY_RESULT')) {
    void loadVerify().then((m) => m.handleVerifyResult(raw)).catch((err) => console.warn('[aim-bridge] VERIFY_RESULT failed', err));
    return true;
  }
  return false;
}

/** Pripojenie mosta: zvýraznenie z detailu overenia ide tou istou cestou ako `FOCUS` od hosta. */
export function startHostReplies(focus: (guids: string[]) => void): void {
  setVerifyFocus(focus);
}

/** Odpojenie mosta: čakajúce žiadosti zlyhajú, stav zo starého spojenia sa zahodí. */
export function stopHostReplies(): void {
  setVerifyFocus(null);
  void reqlib?.then((m) => m.stopReqlib());
  void verify?.then((m) => m.stopVerify());
}

/**
 * Výber sa zmenil (`null` = zrušený): fajočky výmer len pre tento prvok; detail iného prvku sa zavrie aj s kótami,
 * pri zrušenom výbere sa výsledok zabudne.
 */
export function verifySelected(guid: string | null): void {
  const st = useAimVerify.getState();
  useAimVerify.setState({ panelGuid: guid });
  if (guid === null && st.guid) void loadVerify().then((m) => m.forgetVerification());
  else if (st.open) void loadVerify().then((m) => m.closeDetailUnless(guid));
}

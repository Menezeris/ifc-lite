/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Stav ICDD v vieweri (D-181): posledný beh, odoslanie žiadostí hostovi a limit 5 s pre starší host.
 * Kanál na hosta naplní `AimBridge` pri pripojení mosta (ako `idsHost.ts`).
 */

import { create } from 'zustand';
import { buildCheckRequest, buildExportRequest, type IcddStatusMessage } from './icdd-protocol.js';
import { applyStatus, applyTimeout, ICDD_HOST_TIMEOUT_MS, isBusy, startRun, type IcddRun } from './icddPlan.js';

type Post = (msg: Record<string, unknown>, transfer?: Transferable[]) => void;

interface IcddState {
  run: IcddRun | null;
  /** Dialóg s výsledkom je otvorený (zavrie ho používateľ). */
  open: boolean;
  /** Most je pripojený a host je dosiahnuteľný (reaktívne pre ribbon). */
  hostReady: boolean;
  dismiss: () => void;
}

export const useAimIcdd = create<IcddState>((set) => ({
  run: null,
  open: false,
  hostReady: false,
  dismiss: () => set({ open: false }),
}));

let post: Post | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;

/** `AimBridge` nastaví kanál pri pripojení mosta a zruší ho pri odpojení. */
export function setIcddHostPost(next: Post | null): void {
  post = next;
  useAimIcdd.setState({ hostReady: next !== null });
  if (!next) {
    if (timer) clearTimeout(timer);
    timer = null;
    useAimIcdd.setState({ run: null, open: false });
  }
}

export const icddBusy = (): boolean => isBusy(useAimIcdd.getState().run);

function begin(op: 'export' | 'check', send: (id: string) => void): void {
  if (!post || icddBusy()) return;
  const id = `icdd-${Date.now().toString(36)}-${++seq}`;
  useAimIcdd.setState({ run: startRun(id, op), open: true });
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    useAimIcdd.setState((s) => ({ run: applyTimeout(s.run, id) }));
  }, ICDD_HOST_TIMEOUT_MS);
  send(id);
}

export function requestIcddExport(): void {
  begin('export', (id) => post?.(buildExportRequest(id) as unknown as Record<string, unknown>));
}

/** Súbor `.icdd` ide hostovi ako transferable (bez kópie). */
export function requestIcddCheck(name: string, bytes: ArrayBuffer): void {
  begin('check', (id) => post?.(buildCheckRequest(id, name, bytes) as unknown as Record<string, unknown>, [bytes]));
}

/** `ICDD_STATUS` od hosta: prvý stav ruší limit 5 s. */
export function handleIcddStatus(msg: IcddStatusMessage): void {
  const cur = useAimIcdd.getState().run;
  if (!cur || cur.id !== msg.id) return;
  if (timer) clearTimeout(timer);
  timer = null;
  useAimIcdd.setState({ run: applyStatus(cur, msg), open: true });
}

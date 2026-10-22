/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Hák v upstream `BottomStrip` (AIM D-149): maximalizácia panela Lists z chatu tým istým
 * stavom ako tlačidlo Maximize v hlavičke pruhu, a hlásenie, či je pruh maximalizovaný.
 * Požiadavka čaká, kým je v pruhu aktívny panel Lists.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { pendingMaximize, reportStrip, subscribeListView, takeMaximize } from './aimListViewStore.js';

export function useAimStripMaximize(active: string | null, maximized: boolean, setMaximized: (on: boolean) => void): void {
  const want = useSyncExternalStore(subscribeListView, pendingMaximize, pendingMaximize);
  useEffect(() => {
    if (want === null || active !== 'lists') return;
    const on = takeMaximize();
    if (on !== null) setMaximized(on);
  }, [want, active, setMaximized]);
  useEffect(() => reportStrip({ active, maximized }), [active, maximized]);
  useEffect(() => () => reportStrip(null), []);
}

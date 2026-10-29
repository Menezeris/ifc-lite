/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Vstupná časť mosta AIM (App.tsx): v embede lenivo načíta AimBridge, mimo embedu nič.
 * Host posiela príkazy až po READY, ktoré most pošle po pripojení, takže lenivé načítanie
 * žiadny príkaz nestratí. Tu ostáva len to, čo musí platiť od prvého renderu: príznak
 * embedu, závoj počas `?models=` autoloadu a záchyt konca autoloadu (most sa môže
 * pripojiť až po ňom).
 */

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useViewerStore } from '../store/index.js';
import { AUTOLOAD_COMPLETE_EVENT, parseAutoloadUrls } from '../lib/autoload.js';
import { useBim } from '../sdk/BimProvider.js';
import { selectPickedGlobalId } from '../components/viewer/viewport-selection.js';
import { useAimPanelStore } from './aimPanelStore.js';
import { createAutoloadLatch } from './autoloadLatch.js';

/**
 * Čo most potrebuje zo vstupného balíka: lenivý modul by import týchto modulov vytiahol
 * do zdieľaného chunku (FORK_MAINTENANCE, Pre-approved raises bod 1), preto ich dostane odtiaľto.
 */
export interface BridgeEntryDeps {
  bim: ReturnType<typeof useBim>;
  selectPickedGlobalId: typeof selectPickedGlobalId;
}

const AimBridge = lazy(() => import('./AimBridge.js').then((m) => ({ default: m.AimBridge })));

export function AimBridgeMount() {
  const [embedded] = useState(() => window.parent !== window);
  // Veil počas ?models= autoloadu v embede: sekvenčný download beží s
  // `loading === false` (fetch fáza), takže by v iframe hosta preblikla
  // IFClite welcome obrazovka, kým sa nenačíta prvý model. Kým autoload
  // beží a scéna je prázdna, prekryjeme viewer neutrálnym loadingom;
  // po prvom modeli sa odkryje progresívne (zvyšok federácie sa doťahuje
  // už nad viditeľnou scénou). AUTOLOAD_COMPLETE_EVENT fire-uje vždy, aj
  // keď všetky URL zlyhajú — veil teda nemôže visieť navždy.
  const [autoloadVeil, setAutoloadVeil] = useState(
    () => embedded && parseAutoloadUrls(window.location.search, window.location.href).length > 0,
  );
  const [latch] = useState(() => createAutoloadLatch(autoloadVeil));
  const modelCount = useViewerStore((s) => s.models.size);
  const bim = useBim();
  const entry = useMemo<BridgeEntryDeps>(() => ({ bim, selectPickedGlobalId }), [bim]);

  useEffect(() => {
    if (!embedded) return;
    // This app is only ever embedded by the AIM host, so the referrer at
    // mount time IS the trusted origin — no build-time config needed.
    useAimPanelStore.getState().setEmbedded(true, document.referrer ? new URL(document.referrer).origin : null);
    if (!latch.active) return;
    const onAutoloadComplete = () => {
      setAutoloadVeil(false);
      latch.complete();
    };
    window.addEventListener(AUTOLOAD_COMPLETE_EVENT, onAutoloadComplete);
    return () => window.removeEventListener(AUTOLOAD_COMPLETE_EVENT, onAutoloadComplete);
  }, [embedded, latch]);

  if (!embedded) return null;
  return (
    <>
      {/* Veil (viď vyššie): nad celým viewerom, kým autoload nedodá prvý model. */}
      {autoloadVeil && modelCount === 0 && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-white dark:bg-black">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="font-mono text-sm text-zinc-500 dark:text-[#565f89]">Loading model…</p>
        </div>
      )}
      <Suspense fallback={null}>
        <AimBridge autoload={latch} entry={entry} />
      </Suspense>
    </>
  );
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Fajočka overenia pri riadku veličiny v karte Quantities (AIM D-185 UI) a miesto pre jej detail. Napojené dvoma
 * riadkami AIM-FORK v upstream `QuantitySetCard.tsx`, len pre výmery výskytu (nie typu). Bez výsledku od hosta
 * (mimo AIM, prvok bez kontroly, veličina bez receptu) nevykreslí nič a nič nenačíta; fajočka a detail sú
 * lenivé (`AimQtoVerifyBody.tsx`).
 */

import { lazy, Suspense } from 'react';
import { hasTarget, useAimVerify } from './aimVerifyStore';

export interface AimQtoVerifyProps {
  qset: string;
  quantity: string;
}

const load = () => import('./AimQtoVerifyBody');
const LazyBadge = lazy(() => load().then((m) => ({ default: m.AimQtoVerifyBadge })));
const LazyDetail = lazy(() => load().then((m) => ({ default: m.AimQtoVerifyDetail })));

/** Štvorček so stavom pred tlačidlom kopírovania, len keď riadok má výsledok. */
export function AimQtoVerifyBadge(p: AimQtoVerifyProps) {
  const has = useAimVerify((s) => hasTarget(s, `${p.qset}.${p.quantity}`));
  return has ? <Suspense fallback={null}><LazyBadge {...p} /></Suspense> : null;
}

/**
 * Detail pod hodnotou veličiny, len keď je rozbalený. Značka `data-aim-qto` (bez vlastného boxu) označí riadok,
 * aby naň odvodená bunka iného výpočtu vedela posunúť panel (pripomienka 6).
 */
export function AimQtoVerifyDetail(p: AimQtoVerifyProps) {
  const key = `${p.qset}.${p.quantity}`;
  const open = useAimVerify((s) => s.open === key);
  return (
    <>
      <span data-aim-qto={key} className="contents" />
      {open && <Suspense fallback={null}><LazyDetail {...p} /></Suspense>}
    </>
  );
}

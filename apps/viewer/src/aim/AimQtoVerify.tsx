/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Fajočka overenia pri riadku veličiny v karte Quantities (AIM D-185 UI) a miesto pre jej detail. Napojené dvoma
 * riadkami AIM-FORK v upstream `QuantitySetCard.tsx`, len pre výmery výskytu (nie typu). Bez výsledku od hosta
 * (mimo AIM, prvok bez kontroly, veličina bez receptu) nevykreslí nič. Detail je lenivý (`AimVerifyDetail.tsx`).
 */

import { lazy, Suspense } from 'react';
import { useAimVerify, toggleVerifyDetail } from './aimVerifyStore';
import { findTarget, STATUS_GLYPH, STATUS_LABEL, targetKey } from './aimVerifyPlan';

const AimVerifyDetail = lazy(() => import('./AimVerifyDetail').then((m) => ({ default: m.AimVerifyDetail })));

const TONE: Record<string, string> = {
  green: 'border-green-600 bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  yellow: 'border-yellow-600 bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400',
  red: 'border-red-600 bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
  grey: 'border-zinc-400 bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
};

export interface AimQtoVerifyProps {
  qset: string;
  quantity: string;
}

/** Štvorček so stavom; klik rozbalí detail (kóty a zvýraznenie sa ukážu hneď). */
export function AimQtoVerifyBadge({ qset, quantity }: AimQtoVerifyProps) {
  const target = useAimVerify((s) => findTarget(s.data, qset, quantity));
  const key = targetKey(qset, quantity);
  const open = useAimVerify((s) => s.open === key);
  const stale = useAimVerify((s) => s.data?.stale ?? false);
  if (!target) return null;
  const label = `${STATUS_LABEL[target.status]}${stale ? ' (zo staršej revízie)' : ''}: overenie z geometrie, klik ukáže výpočet`;
  return (
    <button
      type="button"
      data-aim-verify={key}
      data-status={target.status}
      aria-expanded={open}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        toggleVerifyDetail(key);
      }}
      className={`mt-0.5 grid size-5 shrink-0 place-items-center border-[1.5px] text-xs font-bold leading-none ${TONE[target.status]} ${stale ? 'border-dashed opacity-60' : ''} ${open ? 'outline outline-2 outline-offset-1 outline-orange-500' : ''}`}
    >
      {STATUS_GLYPH[target.status]}
    </button>
  );
}

/** Detail pod hodnotou veličiny, len keď je rozbalený. */
export function AimQtoVerifyDetail({ qset, quantity }: AimQtoVerifyProps) {
  const key = targetKey(qset, quantity);
  const open = useAimVerify((s) => s.open === key);
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <AimVerifyDetail targetKey={key} />
    </Suspense>
  );
}

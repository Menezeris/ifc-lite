/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Fajočka overenia pri riadku veličiny (AIM D-185 UI), lenivo z `AimQtoVerify.tsx`, až keď riadok má výsledok.
 * Klik rozbalí detail (`AimVerifyDetail.tsx`) a hneď ukáže kóty a vstupné prvky (`aimVerify.ts`). Očko vedľa
 * zapne kótu veličiny bez rozbalenia, aby šlo ukázať viac kót naraz (pripomienka 3, 3. 11.).
 */

import { lazy, Suspense } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAimVerify } from './aimVerifyStore';
import { findTarget, STATUS_GLYPH, STATUS_LABEL, targetKey } from './aimVerifyPlan';
import type { AimQtoVerifyProps } from './AimQtoVerify';

const AimVerifyDetail = lazy(() => import('./AimVerifyDetail').then((m) => ({ default: m.AimVerifyDetail })));

/** Prepne rozbalený detail riadku; kóty a zvýraznenie robí lenivý modul. */
function toggleVerifyDetail(key: string): void {
  const open = useAimVerify.getState().open === key ? null : key;
  useAimVerify.setState({ open });
  void import('./aimVerify').then((m) => (open ? m.showTarget(open) : m.clearShown()));
}

const TONE: Record<string, string> = {
  green: 'border-green-600 bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  yellow: 'border-yellow-600 bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400',
  red: 'border-red-600 bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
  grey: 'border-zinc-400 bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
};


/** Štvorček so stavom; klik rozbalí detail (kóty a zvýraznenie sa ukážu hneď). */
export function AimQtoVerifyBadge({ qset, quantity }: AimQtoVerifyProps) {
  const target = useAimVerify((s) => findTarget(s.data, qset, quantity));
  const key = targetKey(qset, quantity);
  const open = useAimVerify((s) => s.open === key);
  const stale = useAimVerify((s) => s.data?.stale ?? false);
  const shown = useAimVerify((s) => s.shown.includes(key));
  if (!target) return null;
  const label = `${STATUS_LABEL[target.status]}${stale ? ' (zo staršej revízie)' : ''}: overenie z geometrie, klik ukáže výpočet`;
  const eye = shown ? 'Skryť kótu veličiny' : 'Zobraziť kótu veličiny (aj viac naraz)';
  return (
    <>
    <button
      type="button"
      data-aim-verify-eye={key}
      aria-pressed={shown}
      aria-label={eye}
      title={eye}
      onClick={(e) => {
        e.stopPropagation();
        void import('./aimVerify').then((m) => m.toggleShown(key));
      }}
      className={`mt-0.5 grid size-5 shrink-0 place-items-center ${shown ? 'text-orange-600 dark:text-orange-400' : 'text-zinc-400 opacity-60 hover:opacity-100'}`}
    >
      {shown ? <Eye className="size-3.5" aria-hidden="true" /> : <EyeOff className="size-3.5" aria-hidden="true" />}
    </button>
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
    </>
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

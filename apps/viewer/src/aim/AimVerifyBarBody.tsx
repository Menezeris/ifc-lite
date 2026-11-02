/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Obsah lišty overenia výmer nad kartou Quantities (AIM D-185 UI), lenivo z `AimVerifyBar.tsx`: revízia overenia,
 * súhrn stavov, či je výsledok zastaraný, a rozbaľovacie "Ako to funguje?".
 */

import { useEffect, useState } from 'react';
import { useAimVerify } from './aimVerifyStore';
import { countByStatus, STATUS_LABEL } from './aimVerifyPlan';
import type { VerifyStatus } from './verify-protocol';
import { idsHostPost } from './idsHost';

const PILL: Record<VerifyStatus, string> = {
  green: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  grey: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function HowItWorks({ helpHref }: { helpHref?: string }) {
  return (
    <div data-aim-verify-help className="mt-1.5 border border-zinc-200 bg-white p-2 text-[11px] leading-snug text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
      <p className="mb-1">Pri každej veličine, pre ktorú má AIM <b>recept</b>, sa hodnota vypočíta z geometrie modelu a porovná s hodnotou, ktorú do súboru zapísal autor.</p>
      <ul className="mb-1 list-disc pl-4">
        <li><b>Recept</b> je pomenovaný postup: ktoré prvky hľadá (doska nad, doska pod, podlahovina, podhľad) a ako z nich počíta. Vstupy sú bunky s hodnotou a prvkom, z ktorého pochádzajú.</li>
        <li><b>Definícia</b> veličiny je zo schémy IFC 4.3 (buildingSMART), s odkazom na presnú verziu.</li>
        <li><b>Tolerancia</b> podľa druhu: dĺžka +- 5 mm, plocha +- 0,5 %, objem +- 0,5 % alebo +- 0,05 m³.</li>
        <li>Stavy: <b>sedí</b>, <b>upozornenie</b> (sedí len iná metóda alebo hodnota chýba), <b>nesedí</b>, <b>nedá sa overiť</b> (chýba vstup alebo geometria).</li>
        <li>Výsledok sa ukladá k <b>revízii</b> modelu; nová revízia ho označí ako zastaraný a prvok sa pri ďalšom zobrazení overí znova. Celý model naraz: ribbon AIM, Overovanie.</li>
      </ul>
      <p>IFC súbor sa nemení, výsledky sú len vrstva AIM.{' '}
        {helpHref && (
          <button type="button" className="text-blue-600 underline dark:text-blue-400" onClick={() => idsHostPost()?.({ source: 'aim-bridge', type: 'AIM_NAVIGATE', href: helpHref })}>
            Rozhodnutie D-185 a recepty
          </button>
        )}
      </p>
    </div>
  );
}

export function AimVerifyBarBody({ globalId }: { globalId: string }) {
  useEffect(() => {
    void import('./aimVerify').then((m) => m.loadVerification(globalId));
  }, [globalId]);
  const st = useAimVerify();
  const [help, setHelp] = useState(false);
  if (st.guid !== globalId) return null;
  const counts = countByStatus(st.data);
  const busy = st.status === 'loading' || st.status === 'running';
  return (
    <div data-aim-verify-bar className="mb-3 text-[11px] text-zinc-500 dark:text-zinc-400">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {busy && <span>{st.status === 'running' ? 'Overujem výmery z geometrie...' : 'Načítavam overenie výmer...'}</span>}
        {st.status === 'error' && <span className="text-red-600 dark:text-red-400">Overenie výmer: {st.error}</span>}
        {st.data && !busy && (
          <>
            <span>Overenie z geometrie: <b className="text-zinc-700 dark:text-zinc-200">rev. {st.data.revision}</b>{st.data.checked_at ? `, ${formatDate(st.data.checked_at)}` : ''}</span>
            {(Object.keys(counts) as VerifyStatus[]).filter((k) => counts[k] > 0).map((k) => (
              <span key={k} className={`px-1.5 font-semibold ${PILL[k]}`}>{counts[k]} {STATUS_LABEL[k].toLowerCase()}</span>
            ))}
          </>
        )}
        <button type="button" aria-expanded={help} className="text-blue-600 underline dark:text-blue-400" onClick={() => setHelp((v) => !v)}>Ako to funguje?</button>
      </div>
      {st.data?.stale && !busy && (
        <div className="mt-1.5 border border-orange-200 bg-orange-50 px-2 py-1 text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300">
          Overené na revízii {st.data.revision}, model je na revízii {st.data.current_revision}; overenie znova sa nepodarilo.
        </div>
      )}
      {help && <HowItWorks helpHref={st.data?.help_href} />}
    </div>
  );
}

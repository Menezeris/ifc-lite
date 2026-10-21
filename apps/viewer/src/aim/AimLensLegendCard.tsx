/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Malá legenda AIM chat lens (AIM D-125, #178): plávajúca karta nad scénou len
 * s aktívnou lens z chatu (farba, pravidlo alebo hodnota, počet), bez panelu
 * Lens s predvolenými lenses. Údaje sú tie isté ako súhrn pre hosta
 * (`summarizeLens`), takže karta a odpoveď toolu sa zhodujú.
 */

import { X } from 'lucide-react';
import { useViewerStore } from '../store/index.js';
import { AUTO_COLOR_FROM_LIST_ID } from '@/lib/lens/persistence';
import { isAimLens, summarizeLens } from './aimLensPlan.js';
import { useAimLegendStore } from './aimLegendStore.js';

const MAX_ROWS = 30;

export function AimLensLegendCard() {
  const visible = useAimLegendStore((s) => s.visible);
  const setVisible = useAimLegendStore((s) => s.setVisible);
  const lens = useViewerStore((s) => {
    const slot = s.savedLenses.find((l) => l.id === AUTO_COLOR_FROM_LIST_ID);
    return s.activeLensId === AUTO_COLOR_FROM_LIST_ID && isAimLens(slot) ? slot : null;
  });
  const counts = useViewerStore((s) => s.lensRuleCounts);
  const legend = useViewerStore((s) => s.lensAutoColorLegend);
  if (!visible || !lens) return null;

  const summary = summarizeLens(lens, counts, legend);
  const rows = (summary.legend.length > 0 ? summary.legend : summary.rules).slice(0, MAX_ROWS);
  const more = Math.max(0, (summary.legend.length || summary.rules.length) - rows.length);
  return (
    <div
      className="absolute right-3 bottom-14 z-30 w-64 max-h-[45%] overflow-auto rounded-md border border-zinc-200 bg-white/95 p-2 text-xs shadow-lg pointer-events-auto dark:border-zinc-700 dark:bg-zinc-900/95"
      data-aim-legend-card={rows.length}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="flex-1 font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-200">{summary.name}</span>
        <span className="text-zinc-500">{summary.matched}</span>
        <button type="button" className="rounded p-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Zavrieť legendu" onClick={() => setVisible(false)}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="space-y-0.5">
        {rows.map((r, i) => (
          <li key={`${r.name}-${i}`} className={`flex items-center gap-2 ${r.count === 0 ? 'opacity-50' : ''}`}>
            <span className="h-3 w-3 shrink-0 rounded-sm border border-black/10" style={{ background: r.color }} />
            <span className="flex-1 min-w-0 truncate text-zinc-800 dark:text-zinc-100" title={r.name}>{r.name}</span>
            <span className="tabular-nums text-zinc-500">{r.count}</span>
          </li>
        ))}
      </ul>
      {more > 0 && <div className="mt-1 text-zinc-500">a ďalších {more}</div>}
    </div>
  );
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Malý dialóg so stavom a výsledkom ICDD (D-181): priebeh z hosta (`running` správy), potom výsledok
 * a prvé chyby. Mountuje ho `AimBridge`, aby prežil prepnutie záložky ribbonu.
 */

import { useAimIcdd } from './aimIcddStore';
import { isBusy, summarize } from './icddPlan';

export function AimIcddDialog() {
  const run = useAimIcdd((s) => s.run);
  const open = useAimIcdd((s) => s.open);
  const dismiss = useAimIcdd((s) => s.dismiss);
  if (!run || !open) return null;
  const busy = isBusy(run);
  const sum = busy ? null : summarize(run);
  const tone = busy ? 'border-border' : sum?.ok ? 'border-green-600' : 'border-red-600';
  return (
    <div
      aria-live="polite"
      data-testid="aim-icdd-dialog"
      className={`fixed bottom-4 right-4 z-[9000] w-80 rounded-md border bg-background p-3 text-xs shadow-lg ${tone}`}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <strong className="text-sm">{busy ? (run.op === 'export' ? 'Export ICDD' : 'Kontrola ICDD') : sum?.title}</strong>
        {!busy && (
          <button type="button" aria-label="Zavrieť" className="opacity-70 hover:opacity-100" onClick={dismiss}>x</button>
        )}
      </div>
      {busy ? (
        <p className="flex items-center gap-2">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          {run.message}
        </p>
      ) : (
        <>
          {sum?.lines.map((l, i) => <p key={i}>{l}</p>)}
          {sum && sum.errors.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-red-600 dark:text-red-400" data-testid="aim-icdd-errors">
              {sum.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

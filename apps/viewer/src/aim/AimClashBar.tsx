/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Lišta "Uložiť do AIM" nad panelom clash (D-164). Ukazuje, či test pochádza z AIM (názov, verzia, upravené,
 * koľko uložených dvojíc sa v čerstvom behu našlo), uloží test a stavy ako novú verziu a spustí beh, ktorý si
 * vyžiadal chat (`clash open run`). Načítava sa lenivo.
 */

import { useEffect } from 'react';
import { useTranslation } from '@/i18n';
import { useViewerStore } from '@/store';
import { runRequestOf } from '@/lib/clash/run-request';
import { matchRun } from './aimClashPlan.js';
import { activePreset, currentSignature, useAimClash } from './aimClashStore.js';
import { saveToAim } from './aimClash.js';

interface Props {
  /** Beh jedného pravidla (presetu) z panela clash. */
  runPreset: (presetId: string) => Promise<void>;
}

export default function AimClashBar({ runPreset }: Props) {
  const { t } = useTranslation();
  const slot = useAimClash((s) => s.slot);
  const status = useAimClash((s) => s.status);
  const run = useAimClash((s) => s.run);
  const expected = useAimClash((s) => s.expected);
  const preset = useViewerStore((s) => activePreset(s, slot));
  const result = useViewerStore((s) => s.clashRawResult);
  const running = useViewerStore((s) => s.clashRunning);
  const signature = useViewerStore((s) => (preset ? currentSignature(s, preset) : null));
  const hasModel = useViewerStore((s) => [...s.models.values()].some((m) => m.ifcDataStore != null && m.geometryResult != null));

  // Beh z chatu čaká na model s geometriou; spustí sa raz.
  useEffect(() => {
    if (!run || !preset || !hasModel || running) return;
    useAimClash.setState({ run: null });
    void runPreset(preset.id);
  }, [run, preset, hasModel, running, runPreset]);

  const linked = !!slot && slot.presetId === preset?.id;
  const dirty = linked && signature !== slot?.baseline;
  const ranPreset = result != null && runRequestOf(result)?.kind === 'preset';
  const match = linked && expected && ranPreset && preset ? matchRun(expected, result.clashes, preset.id) : null;
  const saving = status?.kind === 'saving';

  const statusText = (() => {
    switch (status?.kind) {
      case 'saving': return t('aimFork.clash.saving');
      case 'saved': return t('aimFork.clash.saved', { version: status.version ?? 0 });
      case 'conflict': return t('aimFork.clash.conflict', { latest: status.latest ?? 0 });
      case 'error': return t('aimFork.clash.error', { reason: status.error ?? '' });
      default: {
        if (!linked) return t('aimFork.clash.unlinked');
        const base = t(dirty ? 'aimFork.clash.linkedEdited' : 'aimFork.clash.linked', { name: preset?.name ?? '', version: slot?.version ?? 0 });
        return match ? `${base} ${t('aimFork.clash.matched', { found: match.found, missing: match.missing })}` : base;
      }
    }
  })();

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-2 py-1" data-testid="aim-clash-bar">
      <button
        type="button"
        disabled={!ranPreset || saving}
        onClick={() => saveToAim()}
        className="min-h-6 shrink-0 rounded border px-2 text-2xs font-medium hover:bg-muted disabled:opacity-50"
      >
        {t('aimFork.clash.save')}
      </button>
      <output className="min-w-0 break-words text-2xs text-muted-foreground">{statusText}</output>
    </div>
  );
}

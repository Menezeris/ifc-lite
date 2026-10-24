/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Lišta "Uložiť do AIM" nad panelom clash (D-164). Ukazuje, či test pochádza z AIM (názov, verzia, upravené,
 * koľko uložených dvojíc sa v čerstvom behu našlo), uloží test a stavy ako novú verziu a spustí beh, ktorý si
 * vyžiadal chat (`clash open run`). Načítava sa lenivo.
 */

import { useEffect, useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { useViewerStore } from '@/store';
import { runRequestOf } from '@/lib/clash/run-request';
import { matchRun, testSignature } from './aimClashPlan.js';
import { activePreset, changesOf, clashesOf, testOf, useAimClash } from './aimClashStore.js';
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
  const loaded = useAimClash((s) => s.loaded);
  const preset = useViewerStore((s) => activePreset(s, slot));
  const result = useViewerStore((s) => s.clashRawResult);
  const running = useViewerStore((s) => s.clashRunning);
  const hasModel = useViewerStore((s) => [...s.models.values()].some((m) => m.ifcDataStore != null && m.geometryResult != null));
  // Zmena testu alebo stavov: prepočíta sa len pri zmene toho, z čoho sa skladá (nie pri každej zmene store).
  const reviews = useViewerStore((s) => s.clashReviews);
  const settings = useViewerStore((s) => `${s.clashMode} ${s.clashTolerance} ${s.clashClearance}`);
  const models = useViewerStore((s) => s.models);
  const dirty = useMemo(() => {
    const linked = slot && slot.presetId === preset?.id ? slot : null;
    if (!linked || !preset) return false;
    const v = useViewerStore.getState();
    return testSignature(testOf(v, preset, linked.code)) !== linked.testSig || changesOf(v, slot, preset, loaded).changes.length > 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, preset, loaded, reviews, settings, models, result]);

  // Beh z chatu čaká na model s geometriou; spustí sa raz.
  useEffect(() => {
    if (!run || !preset || !hasModel || running) return;
    useAimClash.setState({ run: null });
    void runPreset(preset.id);
  }, [run, preset, hasModel, running, runPreset]);

  const linked = !!slot && slot.presetId === preset?.id;
  const ranPreset = result != null && preset != null && runRequestOf(result)?.kind === 'preset';
  const match = linked && loaded && ranPreset && preset ? matchRun(loaded.results, clashesOf(useViewerStore.getState()), preset.id) : null;
  const saving = status?.kind === 'saving';
  // Uložené potvrdenie neplatí, keď sa po ňom niečo zmenilo: ukáže sa stav "upravené".
  const shown = status?.kind === 'saved' && dirty ? null : status;

  const statusText = (() => {
    switch (shown?.kind) {
      case 'saving': return t('aimFork.clash.saving');
      case 'saved': {
        const base = t('aimFork.clash.saved', { results: shown.results ?? 0, reviews: shown.reviews ?? 0 });
        return shown.notes?.length ? `${base} ${shown.notes.join(' ')}` : base;
      }
      case 'error': return t('aimFork.clash.error', { reason: shown.error ?? '' });
      default: {
        if (!linked) return t('aimFork.clash.unlinked');
        const base = t(dirty ? 'aimFork.clash.linkedEdited' : 'aimFork.clash.linked', { code: slot?.code ?? '' });
        return match ? `${base} ${t('aimFork.clash.matched', { found: match.found, missing: match.missing })}` : base;
      }
    }
  })();

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-2 py-1" data-testid="aim-clash-bar">
      <button
        type="button"
        disabled={!preset || saving}
        onClick={() => saveToAim()}
        className="min-h-6 shrink-0 rounded border px-2 text-2xs font-medium hover:bg-muted disabled:opacity-50"
      >
        {t('aimFork.clash.save')}
      </button>
      <output className="min-w-0 break-words text-2xs text-muted-foreground">{statusText}</output>
    </div>
  );
}

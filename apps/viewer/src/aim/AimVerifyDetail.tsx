/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Detail overenia jednej veličiny (AIM D-185 UI), lenivo z `AimQtoVerify.tsx`: hodnota zo súboru a z geometrie,
 * rozdiel a tolerancia, slovami ako sa počíta, vzorec s pomenovanými bunkami (hodnota a prvok, z ktorého pochádza),
 * definícia zo schémy s odkazom, MethodOfMeasurement a Formula zo súboru, kontrolné výpočty. Klik na kód prvku
 * v bunke ho zvýrazní vo vieweri.
 */

import { useState } from 'react';
import { useAimVerify } from './aimVerifyStore';
import { calculationText, difference, formatDifference, formatValue, STATUS_LABEL } from './aimVerifyPlan';
import type { VerifyRecipeWire, VerifyStatus, VerifyTargetWire } from './verify-protocol';

const PILL: Record<VerifyStatus, string> = {
  green: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  grey: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};
const RESULT_ROW: Record<VerifyStatus, string> = {
  green: 'bg-green-50 dark:bg-green-950/60',
  yellow: 'bg-yellow-50 dark:bg-yellow-950/60',
  red: 'bg-red-50 dark:bg-red-950/60',
  grey: 'bg-zinc-50 dark:bg-zinc-900',
};

const focus = (guid: string) => void import('./aimVerify').then((m) => m.focusElement(guid));

function Cells({ recipe, unit }: { recipe: VerifyRecipeWire; unit: string }) {
  if (recipe.cells.length === 0) {
    return recipe.formula_text ? <div className="mb-2 border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-[11px] dark:border-zinc-700 dark:bg-zinc-900">{recipe.formula_text}</div> : null;
  }
  return (
    <>
      {recipe.expression && (
        <div className="mb-1 border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-[11px] dark:border-zinc-700 dark:bg-zinc-900">
          <b className="mr-1.5 text-violet-600 dark:text-violet-400">fx</b>= {recipe.expression}
        </div>
      )}
      <table className="mb-2 w-full border-collapse text-[11px]">
        <tbody>
          {recipe.cells.map((c) => (
            <tr key={c.key}>
              <th className="w-6 border border-zinc-300 bg-zinc-100 px-1 text-center font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{c.key}</th>
              <td className="border border-zinc-300 px-1.5 py-0.5 dark:border-zinc-700">{c.label}</td>
              <td className="border border-zinc-300 px-1.5 py-0.5 dark:border-zinc-700">
                {c.global_id ? (
                  <button type="button" className="text-blue-600 underline decoration-dotted dark:text-blue-400" title="Zvýrazniť prvok vo vieweri" onClick={() => focus(c.global_id!)}>
                    {c.ref ?? c.global_id}
                  </button>
                ) : (c.ref ?? '')}
              </td>
              <td className="whitespace-nowrap border border-zinc-300 px-1.5 py-0.5 text-right font-mono dark:border-zinc-700">{formatValue(c.value, c.unit)}</td>
            </tr>
          ))}
          <tr className={`font-semibold ${RESULT_ROW[recipe.status]}`}>
            <th className="border border-zinc-300 px-1 text-center dark:border-zinc-700">=</th>
            <td className="border border-zinc-300 px-1.5 py-0.5 dark:border-zinc-700" colSpan={2}>{recipe.expression ?? 'výsledok'}</td>
            <td className="whitespace-nowrap border border-zinc-300 px-1.5 py-0.5 text-right font-mono dark:border-zinc-700">{formatValue(recipe.computed_value, unit)}</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

function Body({ t }: { t: VerifyTargetWire }) {
  const [copied, setCopied] = useState(false);
  const main = t.recipes[0];
  const checks = t.recipes.slice(1);
  const quantity = t.target.slice(t.target.indexOf('.') + 1);
  return (
    <div data-aim-verify-detail={t.target} className="mt-1.5 border border-zinc-200 bg-white p-2 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`px-1.5 text-[11px] font-semibold ${PILL[t.status]}`}>{STATUS_LABEL[t.status]}</span>
        <b>{quantity}</b>
        <span className="text-zinc-500">recept {main.recipe}</span>
      </div>
      <div className="mb-2 grid grid-cols-3 border border-zinc-200 dark:border-zinc-700">
        {[
          ['Zo súboru', formatValue(t.file_value, t.unit)],
          ['Z geometrie', formatValue(t.computed_value, t.unit)],
          ['Rozdiel', formatDifference(difference(t), t.unit)],
        ].map(([k, v]) => (
          <div key={k} className="border-l border-zinc-200 px-2 py-1 first:border-l-0 dark:border-zinc-700">
            <small className="block text-[10px] uppercase tracking-wide text-zinc-500">{k}</small>
            <span className="font-mono font-semibold">{v}</span>
          </div>
        ))}
      </div>
      <p className="mb-2"><span className="text-zinc-500">Ako sa počíta: </span>{main.explanation}</p>
      {main.note && <p className="mb-2 border-l-[3px] border-zinc-400 bg-zinc-50 px-2 py-1 text-[11px] dark:bg-zinc-900">{main.note}</p>}
      <Cells recipe={main} unit={t.unit} />
      <dl className="grid grid-cols-[96px_1fr] gap-x-2 gap-y-1 text-[11px]">
        <dt className="text-zinc-500">Tolerancia</dt>
        <dd>{t.tolerance.text || '-'}</dd>
        {t.definition && (
          <>
            <dt className="text-zinc-500">Definícia</dt>
            <dd>
              "{t.definition}"
              {t.spec && (
                <> <a className="text-blue-600 underline dark:text-blue-400" href={t.spec.url} target="_blank" rel="noopener noreferrer">{t.spec.label}</a></>
              )}
            </dd>
          </>
        )}
        <dt className="text-zinc-500">Zo súboru</dt>
        <dd>
          MethodOfMeasurement: {t.file_meta?.method_of_measurement ?? 'neuvedené'} · Formula: {t.file_meta?.formula ?? 'neuvedené'}
        </dd>
      </dl>
      {checks.map((r) => (
        <div key={r.recipe} className="mt-2 border-t border-dashed border-zinc-200 pt-1.5 text-[11px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span>Kontrolný výpočet ({r.recipe}):</span>
            <span className={`px-1.5 font-semibold ${PILL[r.status]}`}>{STATUS_LABEL[r.status]}</span>
          </div>
          <p className="mb-1">{r.explanation}</p>
          <Cells recipe={r} unit={t.unit} />
        </div>
      ))}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          className="border border-zinc-300 px-2 py-0.5 text-[11px] hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
          onClick={() => void navigator.clipboard?.writeText(calculationText(t)).then(() => setCopied(true), () => setCopied(false))}
        >
          {copied ? 'Skopírované' : 'Kopírovať výpočet'}
        </button>
      </div>
    </div>
  );
}

export function AimVerifyDetail({ targetKey }: { targetKey: string }) {
  const t = useAimVerify((s) => s.data?.targets.find((x) => x.target === targetKey) ?? null);
  return t ? <Body t={t} /> : null;
}

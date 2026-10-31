/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Výber IFC prvkov pod oblasťou pripomienky (AIM #199 bod 2, D-158), krok medzi nakreslením oblasti
 * alebo značiek a formulárom "New topic". Ak je strana kalibrovaná (pôdorys), karta ponúkne prvky
 * pod oblasťou podľa obálok (host ich pri uložení spresní cez `bcf_topic locate`); inak sa vyberá
 * ručne v 3D. Vybrané prvky idú do komponentov témy, odkaz na dokument zostáva ako doteraz.
 */

import { useMemo, useState } from 'react';
import { useViewerStore } from '@/store';
import { useAimDocIssueStore, openIssueForm } from './docIssues';
import { countByClass, mergeGuids, preselected } from './docEntities';
import { MAX_TOPIC_COMPONENTS, proposeEntities, selectedGuids } from './docEntitiesScene';

const BTN = 'min-h-6 rounded border px-2 py-0.5 text-2xs';

export function AimDocumentEntities({ docId }: { docId: string }) {
  const pending = useAimDocIssueStore((s) => (s.docId === docId ? s.pending : null));
  // Počet vybraných v 3D sa mení za chodu: karta ho ukazuje a pri pokračovaní zoberie aktuálny.
  const manual = useViewerStore((s) => Math.max(s.selectedEntitiesSet.size, s.selectedEntity ? 1 : 0));
  const proposal = useMemo(() => (pending ? proposeEntities(pending.target) : null), [pending]);
  const candidates = proposal?.status === 'ok' ? proposal.candidates : [];
  const [checked, setChecked] = useState<Set<string> | null>(null);
  if (!pending || !proposal) return null;
  const on = checked ?? preselected(candidates);

  const toggle = (guid: string) => {
    const next = new Set(on);
    if (!next.delete(guid)) next.add(guid);
    setChecked(next);
  };
  const go = (withEntities: boolean) => {
    const guids = withEntities ? mergeGuids([...on], selectedGuids(), MAX_TOPIC_COMPONENTS) : [];
    void openIssueForm(pending.target, pending.docName, guids);
  };
  const cancel = () => useAimDocIssueStore.getState().set({ phase: 'idle', docId: null, note: null, draftCount: 0, pending: null });
  const classes = countByClass(candidates).slice(0, 4).map((c) => `${c.count} ${c.ifcType.replace(/^Ifc/, '')}`).join(', ');
  const total = proposal.status === 'ok' ? proposal.total : 0;

  return (
    <dialog
      open
      aria-label="IFC prvky pod oblasťou"
      className="fixed left-auto right-3 top-24 z-50 m-0 flex text-foreground max-h-[60vh] w-80 flex-col gap-1 rounded border bg-background p-2 text-2xs shadow-lg"
      data-aim-document-entities
    >
      <div className="font-semibold">IFC prvky pripomienky</div>
      {proposal.status === 'ok' && (
        <p className="text-muted-foreground">
          {total === 0
            ? 'Pod oblasťou nie je žiadny prvok (podľa obálok). Vyber ich ručne v 3D.'
            : `Pod oblasťou ${total} prvkov${classes ? ` (${classes})` : ''}${total > candidates.length ? `, zobrazených ${candidates.length}` : ''}. Návrh podľa obálok, host ho vie spresniť.`}
        </p>
      )}
      {proposal.status === 'no-calibration' && <p className="text-muted-foreground">Strana nie je kalibrovaná. Vyber prvky v 3D a pokračuj.</p>}
      {proposal.status === 'section' && <p className="text-muted-foreground">Zvislý rez: návrh z pôdorysu nejde. Vyber prvky v 3D a pokračuj.</p>}
      {proposal.status === 'no-model' && <p className="text-muted-foreground">Model sa ešte nenačítal. Vyber prvky v 3D po načítaní.</p>}
      {candidates.length > 0 && (
        <>
          <div className="flex gap-1">
            <button type="button" className={BTN} onClick={() => setChecked(new Set(candidates.map((c) => c.guid)))}>Všetky</button>
            <button type="button" className={BTN} onClick={() => setChecked(new Set())}>Žiadne</button>
          </div>
          <ul className="min-h-0 flex-1 overflow-auto" data-aim-entity-list>
            {candidates.map((c) => (
              <li key={c.guid}>
                <label className="flex cursor-pointer items-center gap-1 py-0.5 hover:bg-muted">
                  <input type="checkbox" checked={on.has(c.guid)} onChange={() => toggle(c.guid)} data-aim-entity={c.guid} />
                  <span className="min-w-0 flex-1 truncate" title={c.name}>{c.name || c.guid}</span>
                  <span className="shrink-0 text-muted-foreground">{c.ifcType.replace(/^Ifc/, '')}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-muted-foreground">{manual > 0 ? `Pridá sa aj výber z 3D (${manual}).` : 'Výber z 3D je prázdny.'}</p>
      <div className="flex justify-end gap-1">
        <button type="button" className={BTN} onClick={cancel}>Zrušiť</button>
        <button type="button" className={BTN} onClick={() => go(false)} data-aim-entities-skip>Bez prvkov</button>
        <button type="button" className={`${BTN} border-red-600 bg-red-600 text-white`} onClick={() => go(true)} data-aim-entities-continue>
          Pokračovať ({on.size + manual})
        </button>
      </div>
    </dialog>
  );
}

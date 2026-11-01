/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Výber IFC prvkov pod oblasťou pripomienky (AIM #199 bod 2, D-158), krok medzi nakreslením oblasti
 * alebo značiek a formulárom "New topic". Ak je strana kalibrovaná (pôdorys), karta ponúkne prvky
 * pod oblasťou podľa obálok (host ich pri uložení spresní cez `bcf_topic locate`); inak sa vyberá
 * ručne v 3D. Vybrané prvky idú do komponentov témy, odkaz na dokument zostáva ako doteraz.
 * Pod návrhom je zoznam priradených entít: tlačidlá pridajú aktuálny výber z 3D, podlažie výkresu
 * (kalibrovaná strana) alebo celý projekt (IfcProject), položku možno odstrániť. Do témy idú ako
 * GlobalId v `components` pohľadu, tak ako ich číta host (`entity-scope`, `from_viewer`).
 */

import { useMemo, useState } from 'react';
import { useAimDocIssueStore, openIssueForm } from './docIssues';
import { addPicked, countByClass, mergeGuids, preselected, removePicked, type PickedEntity } from './docEntities';
import { MAX_TOPIC_COMPONENTS, projectPick, proposeEntities, selectionPicks, storeyPick } from './docEntitiesScene';

const BTN = 'min-h-6 rounded border px-2 py-0.5 text-2xs';

export function AimDocumentEntities({ docId }: { docId: string }) {
  const pending = useAimDocIssueStore((s) => (s.docId === docId ? s.pending : null));
  // Zoznam priradených entít; výber z 3D, ktorý už je pri otvorení karty, v ňom je hneď (odstrániť ho možno).
  const [picked, setPicked] = useState<PickedEntity[]>(() => selectionPicks());
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
  const add = (items: PickedEntity[]) => setPicked((list) => addPicked(list, items, MAX_TOPIC_COMPONENTS));
  const storey = pending ? storeyPick(pending.target) : null;
  const go = (withEntities: boolean) => {
    const guids = withEntities ? mergeGuids([...on], picked.map((p) => p.guid), MAX_TOPIC_COMPONENTS) : [];
    void openIssueForm(pending.target, pending.docName, guids);
  };
  const cancel = () => useAimDocIssueStore.getState().set({ phase: 'idle', docId: null, note: null, draftCount: 0, pending: null });
  const classes = countByClass(candidates).slice(0, 4).map((c) => `${c.count} ${c.ifcType.replace(/^Ifc/, '') || 'neznámy typ'}`).join(', ');
  const total = proposal.status === 'ok' ? proposal.total : 0;
  // Zaskrtnute a priradene sa mozu prekryvat: do temy ide ich zjednotenie.
  const count = mergeGuids([...on], picked.map((p) => p.guid), MAX_TOPIC_COMPONENTS).length;

  return (
    <dialog
      open
      aria-label="IFC prvky pod oblasťou"
      className="fixed left-auto right-3 top-24 z-50 m-0 flex max-h-[60vh] w-80 flex-col gap-1 rounded border bg-background p-2 text-2xs text-foreground shadow-lg"
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
                  <span className="shrink-0 text-muted-foreground">{c.ifcType.replace(/^Ifc/, '') || 'neznámy typ'}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 className="font-semibold">Priradené entity</h3>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={BTN} onClick={() => add(selectionPicks())} data-aim-entities-add-selection>Pridať výber z 3D</button>
        <button type="button" className={BTN} disabled={!storey} title={storey ? storey.label : 'Strana nie je kalibrovaná na podlažie'} onClick={() => storey && add([storey])} data-aim-entities-add-storey>Podlažie výkresu</button>
        <button type="button" className={BTN} onClick={() => { const p = projectPick(); if (p) add([p]); }} data-aim-entities-add-project>Celý projekt</button>
      </div>
      {picked.length === 0 ? (
        <p className="text-muted-foreground">Zatiaľ nič. Vyber prvky v 3D a pridaj ich, alebo priraď podlažie či celý projekt.</p>
      ) : (
        <ul className="max-h-24 overflow-auto" data-aim-picked-list>
          {picked.map((p) => (
            <li key={p.guid} className="flex items-center gap-1 py-0.5">
              <span className="min-w-0 flex-1 truncate" title={p.guid}>{p.label}</span>
              <span className="shrink-0 text-muted-foreground">{p.kind === 'project' ? 'Projekt' : p.kind === 'storey' ? 'Podlažie' : 'Prvok'}</span>
              <button type="button" className={BTN} aria-label={`Odstrániť ${p.label}`} onClick={() => setPicked((list) => removePicked(list, p.guid))} data-aim-picked-remove={p.guid}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-1">
        <button type="button" className={BTN} onClick={cancel}>Zrušiť</button>
        <button type="button" className={BTN} onClick={() => go(false)} data-aim-entities-skip>Bez prvkov</button>
        <button type="button" className={`${BTN} border-red-600 bg-red-600 text-white`} onClick={() => go(true)} data-aim-entities-continue>
          Pokračovať ({count})
        </button>
      </div>
    </dialog>
  );
}

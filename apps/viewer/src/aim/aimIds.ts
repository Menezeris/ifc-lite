/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Most medzi IDS v AIM a panelmi IDS Studio a Data validation -> IDS validation (D-162), lenivo pri prvej
 * správe hosta alebo pri prvom zobrazení tlačidla "Uložiť do AIM". Panely a ich stav sú upstreamu (`idsStudio*`,
 * `loadIdsContent`, knižnica definícií validácie); AIM len naplní ich vstup (`IDS_LOAD`), spustí beh a pošle
 * hostovi to, čo používateľ v paneli upravil (`IDS_SAVE`). Tvar správ je v `ids-protocol.ts`, stav v `aimIdsStore.ts`.
 */

import { useViewerStore } from '../store/index.js';
import { loadIdsContent } from '@/hooks/ids/loadIdsContent';
import { setValidationSourceChoice } from '@/lib/validation/validation-source-choice';
import { SOURCE } from './bridge-core.js';
import { idsHostPost } from './idsHost.js';
import { isIdsInbound, type IdsLoadMessage, type IdsSavedMessage, type IdsSaveMessage, type IdsTarget } from './ids-protocol.js';
import { activeIdsEntry, useAimIds, type IdsStatus } from './aimIdsStore.js';

type StudioXml = typeof import('@/lib/ids-studio/xml').studioXml;

export interface IdsDeps {
  noteIssue: (text: string) => void;
}

const store = useViewerStore;
let studioXml: StudioXml | null = null;
let stopTracking: (() => void) | null = null;
let runSeq = 0;
/** Čo sa odoslalo v `IDS_SAVE` a ku ktorému dokumentu to patrí; podľa toho `IDS_SAVED` prepojí dokument s AIM. */
const pending = new Map<IdsTarget, { xml: string; key: string }>();

const setStatus = (status: IdsStatus | null): void => useAimIds.setState({ status });

async function openPanel(key: 'studio' | 'validation', noteIssue: (text: string) => void): Promise<void> {
  const { applyPanels } = await import('./aimPanels.js');
  applyPanels({ [key === 'studio' ? 'idsStudio' : 'validation']: 'open' }, noteIssue);
}

function refreshStudioXml(): void {
  const doc = store.getState().idsStudioState?.doc;
  const written = doc && studioXml ? studioXml(doc) : null;
  useAimIds.setState({ studioXml: written?.ok ? written.xml : null });
}

/** Sleduje dokument v Studiu, aby `dirty` a XML v `view_state` boli aktuálne; zruší ho `stopIds`. */
export async function trackStudio(): Promise<void> {
  studioXml ??= (await import('@/lib/ids-studio/xml')).studioXml;
  if (!stopTracking) {
    stopTracking = store.subscribe((s, prev) => {
      if (s.idsStudioState?.doc !== prev.idsStudioState?.doc) refreshStudioXml();
    });
  }
  refreshStudioXml();
}

/** Odpojenie mosta: sledovanie zaniká, otvorené IDS v paneloch ostáva. */
export function stopIds(): void {
  stopTracking?.();
  stopTracking = null;
  pending.clear();
}

async function loadStudio(msg: IdsLoadMessage, deps: IdsDeps): Promise<void> {
  const [{ importIdsXml }, { loadIdsStudioRuntime }] = await Promise.all([import('@/lib/ids-studio/import'), import('@/lib/ids-studio/runtime-loader')]);
  const imported = importIdsXml(msg.xml);
  if (!imported.ok) return deps.noteIssue(`IDS_LOAD: IDS '${msg.code}' sa nedá otvoriť v Studiu (${imported.error})`);
  await loadIdsStudioRuntime();
  store.getState().idsStudioOpen(imported.doc);
  await trackStudio();
  // Základ pre `dirty` je XML tak, ako ho Studio zapíše, nie text z AIM (iné odsadenie by dalo falošné "upravené").
  const baseline = useAimIds.getState().studioXml ?? msg.xml;
  useAimIds.setState({ studio: { code: msg.code, version: msg.version, docId: imported.doc.docId, baseline } });
  setStatus(null);
  await openPanel('studio', deps.noteIssue);
}

async function loadValidation(msg: IdsLoadMessage, deps: IdsDeps): Promise<void> {
  setValidationSourceChoice('ids');
  // Jedna položka knižnice patrí AIM a nahrádza sa, aby localStorage nezbieral kópie každého otvorenia.
  const previous = useAimIds.getState().validation?.entryId;
  const existing = previous && store.getState().validationDefinitions.entries.some((e) => e.id === previous && e.kind === 'ids') ? previous : undefined;
  await loadIdsContent(store, msg.xml, existing);
  const entry = activeIdsEntry(store.getState());
  if (!entry || entry.xml !== msg.xml) return deps.noteIssue(`IDS_LOAD: IDS '${msg.code}' sa nepodarilo načítať do panela validácie`);
  useAimIds.setState({
    validation: { code: msg.code, version: msg.version, entryId: entry.id, baseline: msg.xml },
    run: msg.run ? { ...(msg.spec ? { spec: msg.spec } : {}), seq: ++runSeq } : null,
  });
  setStatus(null);
  await openPanel('validation', deps.noteIssue);
}

/** Výsledok `IDS_SAVE` od hosta: dokument sa prepojí s AIM (kód, verzia), alebo sa ukáže konflikt či chyba. */
function handleSaved(msg: IdsSavedMessage): void {
  const sent = pending.get(msg.target);
  pending.delete(msg.target);
  if (msg.ok && msg.code && msg.version && sent) {
    const slot = { code: msg.code, version: msg.version, baseline: sent.xml };
    useAimIds.setState(msg.target === 'studio' ? { studio: { ...slot, docId: sent.key } } : { validation: { ...slot, entryId: sent.key } });
    setStatus({ target: msg.target, kind: 'saved', code: msg.code, version: msg.version });
    return;
  }
  if (msg.latest_version) setStatus({ target: msg.target, kind: 'conflict', latest: msg.latest_version, ...(msg.error ? { error: msg.error } : {}) });
  else setStatus({ target: msg.target, kind: 'error', error: msg.error ?? 'unknown' });
}

/** Správa hosta o IDS (`IDS_LOAD`, `IDS_SAVED`); overí sa tu, mimo vstupného balíka. */
export async function runIdsMessage(raw: unknown, deps: IdsDeps): Promise<void> {
  if (!isIdsInbound(raw)) return deps.noteIssue('IDS: neplatná správa (IDS_LOAD, IDS_SAVED)');
  if (raw.type === 'IDS_SAVED') return handleSaved(raw);
  return raw.target === 'studio' ? loadStudio(raw, deps) : loadValidation(raw, deps);
}

/** Tlačidlo "Uložiť do AIM": pošle hostovi XML otvoreného IDS, nad verziou, z ktorej sa vychádzalo. */
export async function saveToAim(target: IdsTarget): Promise<void> {
  const post = idsHostPost();
  const fail = (error: string) => setStatus({ target, kind: 'error', error });
  if (!post) return fail('not connected');
  const aim = useAimIds.getState();
  const v = store.getState();
  let xml: string;
  let key: string;
  let title: string;
  let slot = target === 'studio' ? aim.studio : aim.validation;
  if (target === 'studio') {
    await trackStudio();
    const doc = v.idsStudioState?.doc;
    const current = useAimIds.getState().studioXml;
    if (!doc || current === null) return fail('no IDS is open in the Studio, or its XML cannot be written');
    xml = current;
    key = doc.docId;
    title = doc.ids.info.title;
    if (slot?.docId !== key) slot = null;
  } else {
    const entry = activeIdsEntry(v);
    if (!entry || !v.idsDocument) return fail('no IDS is loaded');
    xml = entry.xml;
    key = entry.id;
    title = v.idsDocument.info.title;
    if (slot?.entryId !== key) slot = null;
  }
  pending.set(target, { xml, key });
  setStatus({ target, kind: 'saving' });
  const msg: IdsSaveMessage = {
    source: SOURCE, type: 'IDS_SAVE', target, xml,
    ...(slot?.code ? { code: slot.code, base_version: slot.version } : {}),
    ...(title.trim() && title.length <= 200 ? { title } : {}),
  };
  post(msg as unknown as Record<string, unknown>);
}

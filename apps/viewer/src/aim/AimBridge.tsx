/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AIM platform bridge — postMessage contract between the AIM Next.js app
 * (iframe host) and this viewer. Mirrors the old three.js ViewerApi /
 * onSelect contract 1:1 so the host side (components/ifc-viewer.tsx in the
 * AIM repo) is a thin iframe wrapper instead of a rewrite. Kept in its own
 * directory, mounted from a single line in App.tsx, so upstream rebases
 * touch this file's neighbourhood as little as possible.
 *
 * Wire format is intentionally NOT @ifc-lite/embed-protocol — that protocol
 * is scoped to the thin `viewer-embed` app (numeric expressId selection,
 * generic host). This bridge talks to one specific, trusted parent (the AIM
 * app) and only needs GUID-centric focus/filter/pick, so a small
 * self-contained protocol keeps the Fáza 2 host wrapper close to the
 * original ViewerApi shape.
 */

import { useEffect, useRef, useState } from 'react';
import { useBim } from '../sdk/BimProvider.js';
import { useViewerStore } from '../store/index.js';
import { AUTOLOAD_COMPLETE_EVENT, parseAutoloadUrls } from '../lib/autoload.js';
import { selectPickedGlobalId } from '../components/viewer/viewport-selection.js';
import {
  SOURCE, FILTER_COLOR, FOCUS_COLOR, isInboundMessage, guidForEntity, resolveGuids, resolveSelector,
  type InboundMessage, type OutboundMessage,
} from './bridge-protocol.js';
import { isCommandMessage, type AppliedMessage, type CommandInboundMessage } from './command-protocol.js';
import { createCommandGate, noteIssue, resetCommandState, settled, takeIssues, track } from './command-gate.js';
import { useAimPanelStore } from './aimPanelStore.js';
import { useCapturePinsStore } from './capturePinsStore.js';
import { useAimDocRegionStore } from './docRegion.js';
import { handleDocumentMessage, wireDocumentEvents } from './docBridge.js';
import { useAimDecorationsStore } from './aimDecorationsStore.js';
import { useAimDerivationsStore } from './aimDerivationsStore.js';
import { isViewMessage } from './view-protocol.js';
import { withTabs } from './viewTabsStore.js';
import { applySectionCap, isSectionCapMessage } from './sectionCap.js';
import { isDerivationsMessage } from './derivations-protocol.js';
import { isBcfLoadMessage, loadBcfTopics } from './bcf-protocol.js';
import { dispatchLensMessage, isLensEnvelope, lensSettled, resetLensFromChat } from './lens-protocol.js';
import { appliedViewState, prepareFocusView, runSectionBox, setChangesProvider, setFocusProvider, useAimViewCommands } from './useAimViewCommands.js';
import { createViewChangeTracker } from './viewChanges.js';

/** Správy AIM D-132 sa overia až v lenivom module; tu len typ (vstupný balík). */
const aimTyped = (d: unknown, type: string) => !!d && typeof d === 'object' && (d as { source?: unknown }).source === SOURCE && (d as { type?: unknown }).type === type;

/** Príkazy viditeľnosti idú bránou; dáta panelov a dokumentov nie (D-101). */
const VISIBILITY = new Set(['FOCUS', 'SELECT', 'HIGHLIGHT_FILTER', 'CLEAR_FILTER', 'RESET_COLORS', 'COLORIZE', 'HIDE', 'SHOW', 'ISOLATE', 'SHOW_ALL']);
/** Helpery zo vstupného balíka pre lenivý modul príkazov viditeľnosti. */
const VIS_DEPS = { resolveGuids, resolveSelector, selectPickedGlobalId, noteIssue, track, FOCUS_COLOR, FILTER_COLOR, prepareFocusView };
let visibility: Promise<typeof import('./visibility-commands.js')> | null = null;
const loadVisibility = () => (visibility ??= import('./visibility-commands.js'));

/** Najdlhšie čakanie `APPLIED` na asynchrónne kroky (rez cez prvok, kamera, Lens); host čaká 3 s. */
const ACK_WAIT_MS = 2500;
/** Ak geometria po ohlásení modelov neprestane prúdiť, príkazy sa pustia aj tak. */
const STREAM_GRACE_MS = 30_000;

export function AimBridge() {
  const bim = useBim();
  const parentOriginRef = useRef<string | null>(null);
  const embeddedRef = useRef(false);
  // Brána príkazov (AIM D-101): do načítania modelov a dotečenia geometrie sa
  // príkazy radia a vykonajú potom v poradí, predtým sa zahodili.
  const modelsAnnouncedRef = useRef(false);
  // Odklad sa ráta od ohlásenia modelov alebo od začiatku ďalšieho prúdu geometrie (neskorší model), čo je neskôr.
  const graceFromRef = useRef(0);
  const gateRef = useRef(createCommandGate(() => modelsAnnouncedRef.current
    && (!useViewerStore.getState().geometryStreamingActive || Date.now() - graceFromRef.current > STREAM_GRACE_MS)));
  const startGrace = () => {
    graceFromRef.current = Date.now();
    setTimeout(() => gateRef.current.flush(), STREAM_GRACE_MS + 50);
  };
  // Pohľad (AIM D-083): rez, kamera, režim 3D|2D|Split - vlastný protokol.
  const viewCommands = useAimViewCommands(bim);

  useEffect(() => {
    // No parent frame (e.g. a standalone viewer tab) — nothing to bridge.
    embeddedRef.current = window.parent !== window;
    if (!embeddedRef.current) return;

    // This app is only ever embedded by the AIM host, so the referrer at
    // mount time IS the trusted origin — no build-time config needed.
    parentOriginRef.current = document.referrer ? new URL(document.referrer).origin : null;
    useAimPanelStore.getState().setEmbedded(true, parentOriginRef.current);

    function post(msg: OutboundMessage) {
      window.parent.postMessage(msg, parentOriginRef.current ?? '*');
    }

    const origin = () => parentOriginRef.current ?? '*';
    const gate = gateRef.current;
    const changes = createViewChangeTracker(setChangesProvider); // zmeny pohľadu mimo príkazov (D-125)
    const command = (fn: () => void) => gate.run(() => { changes.beforeCommand(); fn(); });
    // Modul príkazov viditeľnosti sa načíta hneď (mimo vstupného balíka); brána drží príkazy
    // až do načítania modelov, takže je vtedy pripravený a príkazy idú synchrónne v poradí.
    let vis: Awaited<ReturnType<typeof loadVisibility>> | null = null;
    let removeFocusDismiss: (() => void) | null = null;
    void loadVisibility().then((m) => {
      vis = m;
      setFocusProvider(m.focusSummary);
      removeFocusDismiss = m.installFocusDismiss(bim); // klik a Esc zrušia oranžovú z FOCUS (#94)
    });
    const runVisibility = (msg: InboundMessage | CommandInboundMessage) => {
      if (vis) vis.runVisibilityCommand(msg, bim, VIS_DEPS);
      else track(loadVisibility().then((m) => m.runVisibilityCommand(msg, bim, VIS_DEPS)));
    };

    // `ACK_REQUEST` ide bránou za príkazmi, preto ich vidí vykonané; počká ešte na ich asynchrónne kroky.
    async function answerAck(cmdId: string) {
      const done = await settled(ACK_WAIT_MS);
      // null = lens z chatu sa nepoužila; chyba výpočtu súhrnu je problém, nie úspech.
      const lens = await lensSettled(ACK_WAIT_MS).catch((err: unknown) => {
        noteIssue(`Lens: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      });
      const state = await appliedViewState().catch((err: unknown) => {
        noteIssue(`stav viewera: ${err instanceof Error ? err.message : String(err)}`);
        return undefined;
      });
      // Problémy až po stave a Lens, aby ich chyby patrili do tohto potvrdenia.
      const issues = takeIssues();
      if (!done) issues.push('niektoré kroky vo vieweri ešte bežia');
      const extra = { ...(lens ? { lens } : {}), ...changes.ackedState() };
      const applied: AppliedMessage = { source: SOURCE, type: 'APPLIED', cmdId, ok: issues.length === 0, issues, state: state && { ...state, ...extra } };
      window.parent.postMessage(applied, origin());
    }

    function onMessage(e: MessageEvent) {
      // Len priamy rodič — iné okná (popupy, vnorené iframy) nemajú čo
      // posielať bridge príkazy, ani keby trafili origin.
      if (e.source !== window.parent) return;
      if (parentOriginRef.current && e.origin !== parentOriginRef.current) return;
      if (isViewMessage(e.data)) {
        const msg = e.data;
        // Otázky odpovedajú hneď (aj počas načítania), príkazy idú bránou.
        if (msg.type === 'QUERY') viewCommands.current(msg, origin());
        else command(() => viewCommands.current(msg, origin()));
        return;
      }
      if (aimTyped(e.data, 'VIEW_TABS')) {
        const raw: unknown = e.data; // Záložky z chatu (D-132), overenie aj vykonanie v lenivom module, v poradí
        command(() => { const p = withTabs((m) => m.runTabsMessage(raw, noteIssue)); if (p) track(p); });
        return;
      }
      if (aimTyped(e.data, 'SET_SECTION_BOX')) {
        const raw: unknown = e.data; // Rezný box (D-132)
        command(() => runSectionBox(raw));
        return;
      }
      if (isSectionCapMessage(e.data)) {
        const msg = e.data; // Vzhľad reznej plochy (D-120)
        command(() => applySectionCap(msg, useViewerStore.getState));
        return;
      }
      if (isLensEnvelope(e.data)) {
        const msg = e.data; // Lens z chatu (D-096)
        if (msg.type === 'LENS_QUERY') void dispatchLensMessage(msg, origin());
        else command(() => track(dispatchLensMessage(msg, origin())));
        return;
      }
      if (isCommandMessage(e.data)) {
        const msg = e.data;
        if (msg.type === 'ACK_REQUEST') gate.run(() => void answerAck(msg.cmdId)); else command(() => runVisibility(msg));
        return;
      }
      if (isDerivationsMessage(e.data)) {
        // AIM layer over the models (D-089): rules + model revisions for the
        // AIM ribbon tab and the AIM layers panel (D-104).
        useAimDerivationsStore.getState().setLayer(e.data.layer);
        return;
      }
      if (isBcfLoadMessage(e.data, parentOriginRef.current)) {
        loadBcfTopics(e.data, useViewerStore.getState); // AIM host's BCF topics, read-only (D-099)
        return;
      }
      if (!isInboundMessage(e.data)) return;
      if (VISIBILITY.has(e.data.type)) {
        const msg = e.data;
        command(() => runVisibility(msg));
        return;
      }

      switch (e.data.type) {
        case 'AIM_PANEL_DATA':
          useAimPanelStore.getState().resolve(e.data.guid, { data: e.data.data });
          break;
        case 'AIM_PANEL_EMPTY':
          useAimPanelStore.getState().resolve(e.data.guid, { reason: e.data.reason });
          break;
        case 'CAPTURES_LOAD':
          // Reality Capture pins (D-073): host pushes capture points with world
          // coords; the billboard layer (CapturePinLayer) renders them.
          useCapturePinsStore.getState().setPins(e.data.captures);
          break;
        case 'AIM_TREE_DECORATIONS':
          // Per-GUID badge counts (D-077) — HierarchyPanel rows render pills.
          useAimDecorationsStore.getState().setDecorations(e.data.decorations);
          break;
        default:
          handleDocumentMessage(e.data); // podklady, knižnica a karta dokumentu (docBridge.ts)
      }
    }

    wireDocumentEvents(post); // kalibrácia podkladu a taby dokumentov -> host (docBridge.ts)

    // 3D -> host: a capture pin click opens its gallery/panorama host-side (D-073).
    useCapturePinsStore.getState().setEmitClick((captureId) => {
      post({ source: SOURCE, type: 'CAPTURE_PIN_CLICK', captureId });
    });

    window.addEventListener('message', onMessage);
    post({ source: SOURCE, type: 'READY' });
    return () => {
      window.removeEventListener('message', onMessage);
      useViewerStore.getState().setUnderlaySaveHandler(null);
      useViewerStore.getState().setDocumentEventHandler(null);
      useCapturePinsStore.getState().setEmitClick(null);
      useCapturePinsStore.getState().setPins([]);
      useAimDecorationsStore.getState().clear();
      useAimDerivationsStore.getState().clear();
      useAimDocRegionStore.setState({ request: null, highlights: null }); // D-117/D-123: výrez ani rámiky nepatria ďalšej relácii
      resetLensFromChat(); // D-096: izolácia a AIM chat lens neprežijú odpojenie mostu
      removeFocusDismiss?.();
      setFocusProvider(undefined);
      setChangesProvider(undefined);
      resetCommandState(); // problémy a kroky z predošlej relácie nepatria do ďalšieho APPLIED
      void visibility?.then((m) => m.forgetFocus());
    };
  }, [bim]);

  // Signal the host once models finish loading (the `?models=` autoload is
  // async, so READY fires well before geometry/data exist). The host defers
  // the initial deep-link focus (?focus=<guid>) until this event so
  // resolveGuids can actually find the entity.
  //
  // Autoload je SEKVENČNÝ — latch na prvom náraste models.size by ohlásil
  // MODELS_LOADED po PRVOM modeli a deep-link focus na prvok z neskoršieho
  // modelu (VZT vo federácii ASR+VZT) by sa vyhodnotil do prázdna. Pri
  // autoloade preto čakáme na AUTOLOAD_COMPLETE_EVENT z ViewerLayout (fire-uje
  // vždy, aj pri zlyhaní URL — host nesmie čakať navždy); bez autoload
  // parametrov ostáva pôvodný 0 → N latch (manuálny load v embede).
  const modelCount = useViewerStore((s) => s.models.size);
  const announceModels = () => {
    const count = useViewerStore.getState().models.size;
    if (count === 0 || modelsAnnouncedRef.current) return;
    modelsAnnouncedRef.current = true;
    startGrace();
    gateRef.current.flush();
    window.parent.postMessage(
      { source: SOURCE, type: 'MODELS_LOADED', count } satisfies OutboundMessage,
      parentOriginRef.current ?? '*',
    );
  };
  const autoloadingRef = useRef(false);
  // Veil počas ?models= autoloadu v embede: sekvenčný download beží s
  // `loading === false` (fetch fáza), takže by v iframe hosta preblikla
  // IFClite welcome obrazovka, kým sa nenačíta prvý model. Kým autoload
  // beží a scéna je prázdna, prekryjeme viewer neutrálnym loadingom;
  // po prvom modeli sa odkryje progresívne (zvyšok federácie sa doťahuje
  // už nad viditeľnou scénou). AUTOLOAD_COMPLETE_EVENT fire-uje vždy, aj
  // keď všetky URL zlyhajú — veil teda nemôže visieť navždy.
  const [autoloadVeil, setAutoloadVeil] = useState(
    () =>
      window.parent !== window &&
      parseAutoloadUrls(window.location.search, window.location.href).length > 0,
  );
  useEffect(() => {
    if (!embeddedRef.current) return;
    autoloadingRef.current =
      parseAutoloadUrls(window.location.search, window.location.href).length > 0;
    if (!autoloadingRef.current) return;
    const onAutoloadComplete = () => {
      // Autoload skončil — od tejto chvíle prípadné ďalšie (manuálne) loady
      // ohlasuje štandardný 0 → N latch nižšie.
      autoloadingRef.current = false;
      setAutoloadVeil(false);
      announceModels();
    };
    window.addEventListener(AUTOLOAD_COMPLETE_EVENT, onAutoloadComplete);
    return () => window.removeEventListener(AUTOLOAD_COMPLETE_EVENT, onAutoloadComplete);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!embeddedRef.current) return;
    if (modelCount === 0) {
      // Všetky modely odstránené — odlatchni, nech ďalší load ohlási znova.
      modelsAnnouncedRef.current = false;
      return;
    }
    // Počas autoloadu ohlasuje completion event vyššie, nie prvý nárast size.
    if (autoloadingRef.current) return;
    announceModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelCount]);

  // Geometria dotiekla -> zaradené príkazy hosta sa vykonajú (D-101); nový prúd znova spustí odklad.
  useEffect(() => useViewerStore.subscribe((s, prev) => {
    if (!prev.geometryStreamingActive && s.geometryStreamingActive) startGrace();
    if (prev.geometryStreamingActive && !s.geometryStreamingActive) gateRef.current.flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  // 3D -> DB: forward native selection changes to the host. The host
  // resolves guid -> objects.id via its own guidMap (see lib/data/ifc.ts
  // in the AIM repo) and drives ElementInfoPanel / space-siblings from there.
  const selectedEntity = useViewerStore((s) => s.selectedEntity);
  const hadSelectionRef = useRef(false);
  useEffect(() => {
    if (!embeddedRef.current) return;
    const targetOrigin = parentOriginRef.current ?? '*';
    if (!selectedEntity) {
      // Úvodný render má selectedEntity === null — DESELECTED posielaj až
      // po skutočnej selekcii, inak host dostane šum hneď po READY.
      if (!hadSelectionRef.current) return;
      hadSelectionRef.current = false;
      useAimPanelStore.getState().clear();
      window.parent.postMessage({ source: SOURCE, type: 'ENTITY_DESELECTED' } satisfies OutboundMessage, targetOrigin);
      return;
    }
    hadSelectionRef.current = true;
    // FOCUS výber nemení (#97 V1), každá selekcia je teda používateľova alebo zo SELECT.
    // Mobil v embede (D-077 dodatok): tap síce prvok vyberie, ale Properties
    // bottom sheet sa sám neotvorí a plávajúce tlačidlo je ľahké prehliadnuť —
    // po selekcii sheet otvoríme; default tab je AIM inspector. Standalone sa nemení (guard
    // embeddedRef na začiatku effectu).
    {
      const store = useViewerStore.getState();
      if (store.isMobile && store.rightPanelCollapsed) store.setRightPanelCollapsed(false);
    }
    const guid = guidForEntity(useViewerStore.getState().models, selectedEntity);
    if (guid) {
      // AIM layer rows wait for the host's answer:
      // AIM_PANEL_DATA / AIM_PANEL_EMPTY (or the store times out quietly).
      useAimPanelStore.getState().beginLoading(guid);
      window.parent.postMessage({ source: SOURCE, type: 'ENTITY_SELECTED', guid } satisfies OutboundMessage, targetOrigin);
    } else {
      useAimPanelStore.getState().clear();
    }
  }, [selectedEntity]);

  // Veil (viď vyššie): render nad celým viewerom, kým autoload nedodá prvý
  // model. `modelCount === 0` ho zhodí hneď, ako je čo ukázať.
  if (autoloadVeil && modelCount === 0) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-white dark:bg-black">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="font-mono text-sm text-zinc-500 dark:text-[#565f89]">Loading model…</p>
      </div>
    );
  }
  return null;
}

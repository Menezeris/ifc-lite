/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Dokumenty a podklady v moste hosta (D-072, D-075, D-117, D-123, AIM D-127):
 * knižnica dokumentov, podklady výkresov, otvorenie karty s výrezom a rámikmi a
 * udalosti z viewera späť hostovi. Vyčlenené z `AimBridge.tsx` (strop veľkosti
 * modulu); AimBridge sem len odovzdá správu a pri štarte relácie zavolá
 * `wireDocumentEvents`.
 */

import { parsePlacement, serializePlacement } from '@ifc-lite/drawing-underlay';
import { useViewerStore } from '../store/index.js';
import { toGlobalIdFromModels } from '../store/globalId.js';
import { selectPickedGlobalId } from '../components/viewer/viewport-selection.js';
import { SOURCE, resolveGuids, type InboundMessage, type OutboundMessage } from './bridge-protocol.js';
import { noteIssue, track } from './command-gate.js';
import { normalizeDocHighlights, normalizeDocRegion, regionApplied, useAimDocRegionStore } from './docRegion.js';
import { listenDocLinks } from './docLinks.js';

/** Výrez strany z chatu čaká na otvorenie PDF; dlhšie ako ACK by APPLIED len oneskorilo. */
const REGION_WAIT_MS = 2200;

/** Vybaví správu o dokumentoch; false = správa sem nepatrí. */
export function handleDocumentMessage(msg: InboundMessage): boolean {
  switch (msg.type) {
    case 'UNDERLAYS_LOAD': {
      // Georeferencované PDF podklady (D-072): host posiela zoznam
      // dokumentov naviazaných na podlažia + perzistované _georef.
      // Placement JSON je untrusted — validuje ho parsePlacement;
      // nevalidný georef = výkres bez umiestnenia (kalibruje sa znova).
      const drawings = msg.drawings.map((d) => ({
        id: d.documentId,
        name: d.name,
        pdfUrl: d.pdfUrl,
        placement: d.georef !== undefined ? parsePlacement(d.georef) : null,
      }));
      useViewerStore.getState().setUnderlayDrawings(drawings);
      return true;
    }
    case 'DOCUMENTS_LOAD': {
      // Projektové dokumenty (D-075): host posiela knižnicu dokumentov
      // (výkresy/dokumenty/obrázky) pre in-viewer Documents panel.
      // Súrodenec UNDERLAYS_LOAD — kalibrované výkresy chodia v oboch.
      const docs = msg.documents.map((d) => ({
        id: d.documentId,
        name: d.name,
        kind: d.kind,
        url: d.url,
        mime: d.mime,
        storeyGuid: d.storeyGuid ?? null,
        folder: d.folder,
        meta: d.meta,
      }));
      useViewerStore.getState().setViewerDocuments(docs);
      return true;
    }
    case 'DOCUMENT_OPEN': {
      // Deep link (D-075): otvor dokument ako kartu. Neznáme id je no-op
      // (openDocument si to ustráži) — host mohol poslať staršiu linku.
      useViewerStore.getState().openDocument(msg.documentId, msg.page !== undefined ? { page: msg.page } : undefined);
      // Výrez strany z chatu (D-117): karta sa priblíži, keď je PDF otvorené.
      const region = normalizeDocRegion(msg.region);
      if (region) {
        const nonce = useAimDocRegionStore.getState().requestRegion(msg.documentId, region, msg.page);
        // APPLIED (D-101) počká, kým karta výrez naozaj ukáže, a nesie viditeľný rozsah (AIM D-127).
        track(regionApplied(nonce, REGION_WAIT_MS).then((ok) => ok || noteIssue('DOCUMENT_OPEN: výrez strany sa ešte nepoužil (dokument sa načítava)')));
      }
      // Rámiky okolo nájdeného textu (D-123); DOCUMENT_OPEN bez nich staré zruší.
      useAimDocRegionStore.getState().setHighlights(msg.documentId, normalizeDocHighlights(msg.highlights), msg.page);
      return true;
    }
    default:
      return false;
  }
}

/**
 * Výber prvku z odkazu vo výkrese ako klik do modelu (AIM D-082, D-130): selekcia
 * (ENTITY_SELECTED ide hostovi ako pri kliku) a panel vlastností, kamera ostáva.
 */
function selectAsClick(guid: string): boolean {
  const state = useViewerStore.getState();
  const [ref] = resolveGuids(state.models, [guid]);
  if (!ref) return false;
  selectPickedGlobalId(toGlobalIdFromModels(state.models, ref.modelId, ref.expressId));
  useViewerStore.getState().openPanelInHome('properties', 'programmatic');
  return true;
}

/** Udalosti viewera o dokumentoch späť hostovi; volá sa pri štarte relácie mosta. */
export function wireDocumentEvents(post: (msg: OutboundMessage) => void): void {
  // Viditeľný rozsah karty z predošlej relácie nepatrí novej (AIM D-127).
  useAimDocRegionStore.setState({ visible: null });
  listenDocLinks(selectAsClick); // DOCUMENT_LINKS: popisky výkresu -> prvky (AIM D-130, docLinks.ts)

  // Kalibrácia uložená vo viewri → host ju perzistuje do
  // documents.properties._georef (D-072). Session-only bez hosta.
  useViewerStore.getState().setUnderlaySaveHandler((documentId, placement) => {
    post({ source: SOURCE, type: 'UNDERLAY_SAVE', documentId, georef: serializePlacement(placement) });
  });

  // Tab dokumentu otvorený/zavretý vo viewri → host recents/analytics (D-075).
  useViewerStore.getState().setDocumentEventHandler(({ docId, event }) => {
    // Session-local files never leave the viewer — the host has no use for
    // (and no way to resolve) `local:` ids.
    if (docId.startsWith('local:')) return;
    post({ source: SOURCE, type: 'DOCUMENT_EVENT', documentId: docId, event });
  });
}

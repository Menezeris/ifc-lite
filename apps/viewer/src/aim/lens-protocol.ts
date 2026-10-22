/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Bridge správy pre Lens a zoznamy z chatu (AIM D-096, D-111): host pošle pravidlá Lens
 * (`FilterGroup` z `@ifc-lite/rules`) a viewer ich zobrazí ako dočasnú lens
 * "AIM chat" v paneli Lens; `LENS_QUERY` vráti počty na pravidlo. Tu je len
 * lacná kontrola obálky bez importov, aby vstupný balík nerástol; plná
 * validácia a zlúčenie sú v `aimLensPlan.ts`, ktorý sa načíta až pri použití.
 */

import { SOURCE } from './bridge-protocol.js';

/** add = pridať k AIM chat lens, replace = nahradiť, clear = vypnúť, unisolate = zrušiť izoláciu z chatu. */
export const AIM_LENS_MODES = ['add', 'replace', 'clear', 'unisolate'] as const;
export type AimLensMode = (typeof AIM_LENS_MODES)[number];

export interface AimLensRuleWire {
  name: string;
  /** `isolate` = len do izolácie alebo X-ray, bez farby (prvky ostanú v pôvodnom vzhľade). */
  action: 'colorize' | 'transparent' | 'hide' | 'isolate';
  /** Hex `#rrggbb`; pri `isolate` sa nepoužije. */
  color?: string;
  /** `FilterGroup[]` z `@ifc-lite/rules`; pravidlo `model` nesie mená modelov, viewer ich preloží. */
  groups: unknown[];
}

export interface AimAutoColorWire {
  source: 'ifcType' | 'attribute' | 'property' | 'quantity' | 'classification' | 'material' | 'model' | 'group';
  psetName?: string;
  propertyName?: string;
}

export type LensInboundMessage =
  | {
      source: typeof SOURCE;
      type: 'APPLY_LENS';
      mode: AimLensMode;
      /** Značka verzie od hosta; `LENS_QUERY` s ňou počká na vyhodnotenie práve tejto verzie. */
      rev?: string;
      rules?: AimLensRuleWire[];
      /** Izolovať zjednotenie všetkých pravidiel správy (kanál izolácie viewera, nie farba). */
      isolate?: boolean;
      /** X-ray context: zjednotenie pravidiel ostane plné, zvyšok priesvitný (kanál ghost viewera, AIM D-105). */
      xray?: boolean;
      autoColor?: AimAutoColorWire;
      /**
       * Rozsah farieb podľa hodnoty (AIM D-119): `FilterGroup[]` ako pri pravidlách; legenda a
       * počty len za tieto prvky. Bez neho pri zúženom pohľade (izolácia, skrytie) viditeľné prvky.
       */
      autoColorScope?: unknown[];
      /**
       * Veľkosť legendy (AIM D-119): `large` = panel Lens ako veľké plávajúce okno, `normal` = späť do lišty,
       * `compact` = malá karta len s legendou AIM chat lens, panel Lens zavretý (AIM D-125).
       */
      legend?: 'large' | 'normal' | 'compact';
    }
  | { source: typeof SOURCE; type: 'LENS_QUERY'; id: string; rev?: string }
  | {
      source: typeof SOURCE;
      /** Zoznam z chatu (AIM D-111): builder panela Lists s filtrami a stĺpcami. */
      type: 'OPEN_LIST';
      name: string;
      /** Tabuľku po otvorení rovno spustiť (D-148). */
      run?: boolean;
      /** `FilterGroup[]` ako pri Lens; pravidlo `model` nesie mená modelov. */
      groups: unknown[];
      columns: AimListColumnWire[];
      /** Zoskupenie, súčty, zoradenie, hľadanie, maximalizácia (D-149); tvar v `aimListViewPlan.ts`. */
      view?: unknown;
    }
  | {
      source: typeof SOURCE;
      /** Úprava otvoreného zoznamu (D-149): `groups` pribudnú k filtrom (AND, podlažie a model nahradia staré),
       *  `edit` mení stĺpce, triedy a odoberá filtre; tabuľka sa spustí znova. */
      type: 'LIST_UPDATE';
      groups?: unknown[];
      view?: unknown;
      edit?: unknown;
    };

/** Stĺpec zoznamu z chatu, tvar `ColumnDefinition` z `@ifc-lite/lists` bez `id`. */
export interface AimListColumnWire {
  source: 'attribute' | 'property' | 'quantity' | 'material' | 'classification' | 'spatial' | 'model' | 'zone' | 'geometry';
  psetName?: string;
  propertyName: string;
  label?: string;
}

/** Obálka správy Lens (zdroj a typ); obsah overí `parseLensMessage` v lenivom module. */
export function isLensEnvelope(data: unknown): data is LensInboundMessage {
  if (!data || typeof data !== 'object') return false;
  const m = data as Record<string, unknown>;
  return m.source === SOURCE && (m.type === 'APPLY_LENS' || m.type === 'LENS_QUERY' || m.type === 'OPEN_LIST' || m.type === 'LIST_UPDATE');
}

/** Modul Lens z chatu sa načíta až pri prvej správe, aby vstupný balík nerástol. */
let lensModule: Promise<typeof import('./aimLens.js')> | null = null;

let listModule: Promise<typeof import('./aimList.js')> | null = null;

export function dispatchLensMessage(msg: LensInboundMessage, origin: string): Promise<void> {
  if (msg.type === 'OPEN_LIST') {
    listModule ??= import('./aimList.js');
    return listModule.then((m) => m.openListFromChat(msg));
  }
  if (msg.type === 'LIST_UPDATE') {
    listModule ??= import('./aimList.js');
    return listModule.then((m) => m.updateListFromChat(msg));
  }
  lensModule ??= import('./aimLens.js');
  return lensModule.then((m) => m.handleLensMessage(msg, origin));
}

/** Pre `APPLIED` (D-101): počká na vyhodnotenie poslednej lens z chatu a vráti jej súhrn; bez lens null. */
export function lensSettled(timeoutMs: number): Promise<unknown> {
  return lensModule ? lensModule.then((m) => m.settledLensSummary(timeoutMs)) : Promise.resolve(null);
}

/** Pre `APPLIED` (D-148): počká na beh zoznamu z chatu a vráti jeho súhrn; bez zoznamu null. */
export function listSettled(timeoutMs: number): Promise<unknown> {
  return listModule ? listModule.then((m) => m.listSummary(timeoutMs)) : Promise.resolve(null);
}

/** Odpojenie mostu: upratať len vtedy, keď chat Lens vôbec použil. */
export function resetLensFromChat(): void {
  void lensModule?.then((m) => m.resetAimLens());
  void listModule?.then((m) => m.resetListFromChat());
}

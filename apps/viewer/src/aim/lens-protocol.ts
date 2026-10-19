/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Bridge správy pre Lens z chatu (AIM D-096): host pošle pravidlá Lens
 * (`FilterGroup` z `@ifc-lite/rules`) a viewer ich zobrazí ako dočasnú lens
 * "AIM chat" v paneli Lens; `LENS_QUERY` vráti počty na pravidlo. Tu je len
 * lacná kontrola obálky bez importov, aby vstupný balík nerástol; plná
 * validácia a zlúčenie sú v `aimLensPlan.ts`, ktorý sa načíta až pri použití.
 */

import { SOURCE } from './bridge-protocol.js';

/** add = pridať k AIM chat lens, replace = nahradiť, clear = vypnúť, unisolate = zrušiť len izoláciu. */
export const AIM_LENS_MODES = ['add', 'replace', 'clear', 'unisolate'] as const;
export type AimLensMode = (typeof AIM_LENS_MODES)[number];

export interface AimLensRuleWire {
  name: string;
  action: 'colorize' | 'transparent' | 'hide';
  /** Hex `#rrggbb`. */
  color: string;
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
      /** Po pravidlách skryť všetko ostatné (izolácia). */
      isolate?: boolean;
      autoColor?: AimAutoColorWire;
    }
  | { source: typeof SOURCE; type: 'LENS_QUERY'; id: string; rev?: string };

/** Obálka správy Lens (zdroj a typ); obsah overí `parseLensMessage` v lenivom module. */
export function isLensEnvelope(data: unknown): data is LensInboundMessage {
  if (!data || typeof data !== 'object') return false;
  const m = data as Record<string, unknown>;
  return m.source === SOURCE && (m.type === 'APPLY_LENS' || m.type === 'LENS_QUERY');
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Vzhľad reznej plochy z chatu (AIM D-120, AIMviewer#138): `SET_SECTION_CAP`
 * prepne šrafu, plnú výplň alebo žiadnu plochu a farbu výplne. Žiadna nová
 * funkcia: tie isté setery store ako tlačidlo Fill slice a popover Cap
 * (`setSectionShowCap`, `setSectionCapStyle`), takže voľba platí pre všetky
 * roviny a viewer si ju pamätá v prehliadači ako po kliknutí. `none` skryje
 * len plochy, obrysové čiary rezu ostávajú.
 */

import type { SectionCapHatchId, SectionCapStyle } from '@/store/types';
import { SOURCE } from './bridge-protocol.js';

export const SECTION_CAPS = ['none', 'solid', 'hatch'] as const;
export type SectionCap = (typeof SECTION_CAPS)[number];

export interface SectionCapMessage {
  source: typeof SOURCE;
  type: 'SET_SECTION_CAP';
  cap: SectionCap;
  /** Farba výplne `#rrggbb`; priehľadnosť ostáva z aktuálneho štýlu. */
  fillColor?: string;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function isSectionCapMessage(data: unknown): data is SectionCapMessage {
  if (!data || typeof data !== 'object') return false;
  const m = data as Record<string, unknown>;
  return m.source === SOURCE && m.type === 'SET_SECTION_CAP'
    && (SECTION_CAPS as readonly unknown[]).includes(m.cap)
    && (m.fillColor === undefined || (typeof m.fillColor === 'string' && HEX.test(m.fillColor)));
}

/** Šrafa, na ktorú sa vráti `hatch`, keď je práve plná výplň (ako Fill slice). */
const DEFAULT_HATCH: SectionCapHatchId = 'diagonal';

export interface CapPlan {
  showCap: boolean;
  style?: Partial<SectionCapStyle>;
  /** Šrafa, ktorú si treba zapamätať pre ďalší `hatch`. */
  remember?: SectionCapHatchId;
}

/** Čo nastaviť v store; čistá funkcia nad aktuálnym štýlom. */
export function planSectionCap(
  current: { showCap: boolean; capStyle: SectionCapStyle },
  msg: Pick<SectionCapMessage, 'cap' | 'fillColor'>,
  lastHatch: SectionCapHatchId = DEFAULT_HATCH,
): CapPlan {
  const pattern = current.capStyle.pattern;
  const remember = pattern !== 'solid' ? pattern : undefined;
  if (msg.cap === 'none') return { showCap: false, ...(remember ? { remember } : {}) };
  const style: Partial<SectionCapStyle> = {
    pattern: msg.cap === 'solid' ? 'solid' : remember ?? lastHatch,
  };
  if (msg.fillColor) {
    const n = parseInt(msg.fillColor.slice(1), 16);
    style.fillColor = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, current.capStyle.fillColor[3]];
  }
  return { showCap: true, style, ...(remember ? { remember } : {}) };
}

let lastHatch: SectionCapHatchId = DEFAULT_HATCH;

interface CapStore {
  sectionPlane: { showCap: boolean; capStyle: SectionCapStyle };
  setSectionShowCap: (show: boolean) => void;
  setSectionCapStyle: (style: Partial<SectionCapStyle>) => void;
}

export function applySectionCap(msg: SectionCapMessage, getState: () => CapStore): void {
  const state = getState();
  const plan = planSectionCap(state.sectionPlane, msg, lastHatch);
  if (plan.remember) lastHatch = plan.remember;
  if (plan.style) state.setSectionCapStyle(plan.style);
  if (state.sectionPlane.showCap !== plan.showCap) state.setSectionShowCap(plan.showCap);
}

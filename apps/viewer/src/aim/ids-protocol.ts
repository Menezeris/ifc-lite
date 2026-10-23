/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * IDS z AIM (D-162, #285): dokumenty IDS uložené v AIM sa otvoria v paneli IDS Studio alebo v Data validation
 * -> IDS validation a ručná úprava sa uloží späť ako nová verzia. Vlastný lenivý protokol (mimo
 * `bridge-protocol.ts`, ktorý je na rozpočte veľkosti); overuje ho až lenivý `aimIds.ts`.
 *
 * Host -> viewer:
 *  - `IDS_LOAD {code, version, xml, target, title?, spec?, run?}`: otvorí IDS v `studio` alebo `validation`.
 *    `run` spustí kontrolu hneď po načítaní (len `validation`), `spec` (identifikátor, názov alebo id
 *    špecifikácie) obmedzí beh na jednu špecifikáciu.
 *  - `IDS_SAVED {target, ok, code?, version?, error?, latest_version?}`: výsledok `IDS_SAVE`; pri `ok` si viewer
 *    zapamätá kód a verziu (ďalšie uloženie ide nad ňou), pri konflikte `latest_version` nesie poslednú verziu.
 * Viewer -> host:
 *  - `IDS_SAVE {target, xml, code?, base_version?, title?}`: tlačidlo "Uložiť do AIM" v paneli. Bez `code` ide
 *    o nové IDS; `base_version` je verzia, z ktorej sa vychádzalo (host pri inej odpovie 409).
 */

import { SOURCE } from './bridge-core.js';

export type IdsTarget = 'studio' | 'validation';

/** Strop XML v správe (host má vlastný strop 256 kB pri čítaní; zápis je voľnejší). */
export const MAX_IDS_XML = 2_000_000;
const MAX_TEXT = 200;

export interface IdsLoadMessage {
  source: typeof SOURCE;
  type: 'IDS_LOAD';
  code: string;
  version: number;
  xml: string;
  target: IdsTarget;
  title?: string;
  spec?: string;
  run?: boolean;
}
export interface IdsSavedMessage {
  source: typeof SOURCE;
  type: 'IDS_SAVED';
  target: IdsTarget;
  ok: boolean;
  code?: string;
  version?: number;
  error?: string;
  latest_version?: number;
}
export type IdsInboundMessage = IdsLoadMessage | IdsSavedMessage;

export interface IdsSaveMessage {
  source: typeof SOURCE;
  type: 'IDS_SAVE';
  target: IdsTarget;
  xml: string;
  code?: string;
  base_version?: number;
  title?: string;
}

/** Typy správ hosta, ktoré posiela `AimBridge` do lenivého modulu. */
export const IDS_INBOUND_TYPES: readonly string[] = ['IDS_LOAD', 'IDS_SAVED'];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_TEXT;
const isTarget = (v: unknown): v is IdsTarget => v === 'studio' || v === 'validation';
const isVersion = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1;
const optional = (v: unknown, ok: (x: unknown) => boolean) => v === undefined || ok(v);

/** Správa hosta pre IDS (overí tvar). */
export function isIdsInbound(data: unknown): data is IdsInboundMessage {
  if (!isObj(data) || data.source !== SOURCE) return false;
  if (data.type === 'IDS_LOAD') {
    return isText(data.code) && isVersion(data.version) && isTarget(data.target)
      && typeof data.xml === 'string' && data.xml.length > 0 && data.xml.length <= MAX_IDS_XML
      && optional(data.title, isText) && optional(data.spec, isText) && optional(data.run, (v) => typeof v === 'boolean');
  }
  if (data.type === 'IDS_SAVED') {
    return isTarget(data.target) && typeof data.ok === 'boolean' && optional(data.code, isText) && optional(data.version, isVersion)
      && optional(data.latest_version, isVersion) && optional(data.error, (v) => typeof v === 'string' && v.length <= 2000);
  }
  return false;
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Panel vlastností z chatu (AIM D-113, D-127): `SELECT` s `panel` po výbere
 * prepne sekciu upstream panela (Properties | Quantities) a zvýrazní vlastnosť.
 *
 * Upstream skok z bSDD karty (`pendingPropertyFocus`) zvýraznenie po 2,4 s zhasne
 * a nevie výmery ani pset zdedený z typu (AIM D-127, #168). Preto vlastná cesta nad
 * DOM panela: nájde riadok (pset aj Qto, výskyt aj typ), zbalenú sadu rozbalí jej
 * vlastným tlačidlom, riadok vycentruje a označí atribútom `data-aim-focus`
 * (štýl v `assetin-theme.css`). Označenie drží MutationObserver, kým sa nezmení
 * výber; keď React riadok prekreslí (prepnutie sekcie, načítanie), označí ho znova.
 * Výsledok (našla sa / nie je) ide do store pre `view_state` a do `APPLIED`.
 */

import { useViewerStore } from '../store/index.js';
import { useAimInspectorStore, type PropertyFocusState } from './aimInspectorStore.js';
import { cancelReveal, revealRow } from './aimPanelScroll.js';
import { focusSections, matchName, panelPlan, propKeyEntity, type AimPanelView, type PanelSection } from './aimPanelViewPlan.js';

const SETTLE_TIMEOUT_MS = 5000;
/** Ako dlho sa riadok hľadá v jednej sekcii, kým sa skúsi druhá (panel sa vykresľuje postupne). */
const SECTION_SEARCH_MS = 900;
const FOCUS_ATTR = 'data-aim-focus';

type Target = { modelId: string; expressId: number };
type Focus = { pset: string; property: string };
type Hit = { el: Element; section: PanelSection; fromType: boolean };

let stopActive: (() => void) | null = null;

/** Zruší zvýraznenie z chatu (nový SELECT, iný výber). */
export function clearPropertyFocus(): void {
  const stop = stopActive;
  stopActive = null;
  stop?.();
  cancelReveal();
}

/** Obsah panela vlastností: rodič AIM bloku, inak celý dokument. */
function panelScope(): ParentNode {
  return document.querySelector('[data-aim-inspector]')?.parentElement ?? document;
}

/** Riadok vlastnosti v aktuálne vykreslenej sekcii; zbalenú sadu rozbalí (raz). */
function locate(scope: ParentNode, focus: Focus, target: Target, section: PanelSection, opened: Set<Element>): Hit | null {
  if (section === 'properties') {
    for (const row of scope.querySelectorAll('[data-prop-key]')) {
      const id = propKeyEntity(row.getAttribute('data-prop-key') ?? '', focus.pset, focus.property);
      if (id !== null) return { el: row, section, fromType: id !== target.expressId };
    }
  }
  // Hlavička sady = tlačidlo Collapsible (Radix nesie `data-state`) s tučným menom sady.
  const triggers = [...scope.querySelectorAll('button[data-state]')].filter((b) => b.querySelector('span.font-bold'));
  const i = matchName(triggers.map((b) => b.querySelector('span.font-bold')?.textContent), focus.pset);
  if (i < 0) return null;
  const trigger = triggers[i] as HTMLElement;
  if (trigger.getAttribute('data-state') === 'closed') {
    if (!opened.has(trigger)) {
      opened.add(trigger);
      trigger.click(); // rozbalí ako používateľ (upstream si stav zapamätá)
    }
    return null;
  }
  if (section !== 'quantities') return null; // riadky psetov nesú `data-prop-key` vyššie
  const rows = [...(trigger.parentElement?.querySelectorAll('.group\\/copyrow') ?? [])];
  const j = matchName(rows.map((r) => r.querySelector('span.font-medium')?.textContent), focus.property);
  return j < 0 ? null : { el: rows[j], section, fromType: false };
}

/**
 * Po výbere prvku `modelId:expressId` nastaví sekciu a zvýrazní vlastnosť.
 * Promise skončí, keď sa riadok našiel alebo sa zistilo, že na prvku nie je;
 * zvýraznenie potom trvá do ďalšieho výberu.
 */
export function applyPanelView(view: AimPanelView, target: Target, noteIssue: (text: string) => void): Promise<void> {
  clearPropertyFocus();
  const plan = panelPlan(view);
  const store = useViewerStore;
  useAimInspectorStore.getState().setPropertyFocus(null);
  if (plan.section) store.getState().setPropertiesActiveTab(plan.section);
  const focus = plan.focus;
  if (!focus) return Promise.resolve();
  const matches = () => {
    const sel = store.getState().selectedEntity;
    return !!sel && sel.modelId === target.modelId && sel.expressId === target.expressId;
  };
  const report = (state: PropertyFocusState | null) => useAimInspectorStore.getState().setPropertyFocus(state);

  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const cleanups: Array<() => void> = [];
    const stop = () => {
      for (const c of cleanups.splice(0)) c();
      document.querySelectorAll(`[${FOCUS_ATTR}]`).forEach((el) => el.removeAttribute(FOCUS_ATTR));
      finish();
    };
    stopActive = stop;

    const start = () => {
      const sections = focusSections(focus.pset);
      const opened = new Set<Element>();
      const startedAt = Date.now();
      let section = sections[0];
      let found: Hit | null = null;
      if (plan.section !== section) store.getState().setPropertiesActiveTab(section);

      const mark = (first: boolean): boolean => {
        const hit = locate(panelScope(), focus, target, section, opened);
        if (!hit) return false;
        document.querySelectorAll(`[${FOCUS_ATTR}]`).forEach((el) => el !== hit.el && el.removeAttribute(FOCUS_ATTR));
        if (!hit.el.hasAttribute(FOCUS_ATTR)) hit.el.setAttribute(FOCUS_ATTR, '');
        found = hit;
        // Riadok sa vycentruje a drží vo výreze, kým sa panel ustáli (AIM #183); `found` vždy nesie aktuálny prvok.
        if (first) revealRow(() => (found as Hit | null)?.el ?? null);
        return true;
      };
      const tick = () => {
        if (found) {
          // Lepivé: React riadok prekreslil alebo vymenil, označ ho znova (bez posunu).
          if (!found.el.isConnected || !found.el.hasAttribute(FOCUS_ATTR)) {
            section = store.getState().propertiesActiveTab === 'quantities' ? 'quantities' : 'properties';
            mark(false);
          }
          return;
        }
        if (mark(true)) {
          const hit = found as Hit | null;
          report({ ...focus, found: true, section: hit!.section, ...(hit!.fromType ? { from_type: true } : {}) });
          finish();
          return;
        }
        const elapsed = Date.now() - startedAt;
        if (section === sections[0] && elapsed > SECTION_SEARCH_MS) {
          section = sections[1];
          store.getState().setPropertiesActiveTab(section);
        } else if (section === sections[1] && elapsed > 2 * SECTION_SEARCH_MS) {
          section = sections[0];
          store.getState().setPropertiesActiveTab(section);
          report({ ...focus, found: false });
          noteIssue(`SELECT: vlastnosť ${focus.pset}.${focus.property} na prvku v IFC paneli nie je`);
          if (stopActive === stop) stopActive = null;
          stop();
        }
      };
      let raf = 0;
      const schedule = () => {
        if (!raf) {
          raf = requestAnimationFrame(() => {
            raf = 0;
            tick();
          });
        }
      };
      const observer = new MutationObserver(schedule);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state', FOCUS_ATTR] });
      // Vlastný takt hľadania: panel môže dokresliť obsah aj bez sledovanej mutácie.
      const poll = setInterval(() => {
        if (!found) schedule();
      }, 150);
      cleanups.push(() => {
        observer.disconnect();
        clearInterval(poll);
        if (raf) cancelAnimationFrame(raf);
      });
      schedule();
    };

    let armed = false;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      armed = true;
      if (settle) clearTimeout(settle);
      start();
    };
    // Zvýraznenie patrí vybranému prvku: iný výber ho zruší.
    const unsubscribe = store.subscribe((s, prev) => {
      if (s.selectedEntity === prev.selectedEntity) return;
      if (matches()) {
        if (!armed) arm();
      } else if (armed) {
        if (stopActive === stop) stopActive = null;
        stop();
        report(null);
      }
    });
    cleanups.push(unsubscribe);
    if (matches()) {
      arm();
      return;
    }
    settle = setTimeout(() => {
      noteIssue('SELECT: panel vlastností sa nezmenil, výber sa neprejavil');
      if (stopActive === stop) stopActive = null;
      stop();
    }, SETTLE_TIMEOUT_MS);
    cleanups.push(() => clearTimeout(settle));
  });
}

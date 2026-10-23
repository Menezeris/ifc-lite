/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Sledovanie zmien pohľadu mimo príkazov hosta (AIM D-125, #180) pre `AimBridge`:
 * snímka stavu zo store po každom `APPLIED` a pred prvým krokom ďalšieho príkazu.
 * Porovnanie a texty sú v čistom `viewDelta.ts`; tu je len čítanie store.
 */

import { useViewerStore } from '@/store';
import { activeSectionPlane } from '@/store/section-active';
import { AUTO_COLOR_FROM_LIST_ID } from '@/lib/lens/persistence';
import { describeViewChanges, sectionLabel, type ViewSnapshot } from './viewDelta.js';

/** Stav pohľadu na porovnanie; kamera nie (používateľ ňou hýbe stále). */
function viewSnapshot(): ViewSnapshot {
  const s = useViewerStore.getState();
  const lens = s.activeLensId === null ? null : s.savedLenses.find((l) => l.id === s.activeLensId);
  const rules = lens ? lens.rules.filter((r) => !r.id.endsWith('~vol')).length : 0;
  return {
    isolated: s.isolatedEntities ? s.isolatedEntities.size : null,
    xray: s.ghostExceptEntities ? s.ghostExceptEntities.size : null,
    hidden: s.hiddenEntities.size,
    section: sectionLabel(activeSectionPlane(s)),
    selection: s.selectedEntityIds.size > 0 ? s.selectedEntityIds.size : s.selectedEntityId !== null ? 1 : 0,
    lens: s.activeLensId === null ? null
      : s.activeLensId === AUTO_COLOR_FROM_LIST_ID && lens ? `${lens.name} (${rules} pravidiel)` : (lens?.name ?? s.activeLensId),
  };
}

/**
 * Jedna relácia mosta: stav po poslednom potvrdenom príkaze a pred prvým krokom ďalšieho.
 * `register` dostane čítanie zmien pre `view_state` (`setChangesProvider`).
 */
export function createViewChangeTracker(register: (changes: () => string[]) => void) {
  let lastAcked: ViewSnapshot | null = null;
  let beforeCommand: ViewSnapshot | null = null;
  register(() => (lastAcked ? describeViewChanges(lastAcked, viewSnapshot()) : []));
  return {
    /** Volá sa pred každým krokom príkazu; zapamätá si len prvý. */
    beforeCommand(): void {
      beforeCommand ??= viewSnapshot();
    },
    /** Pri `APPLIED`: čo sa zmenilo mimo príkazov pred týmto príkazom (pole stavu); potom nová snímka. */
    ackedState(): { changed_outside_commands?: string[] } {
      const outside = lastAcked ? describeViewChanges(lastAcked, beforeCommand ?? viewSnapshot()) : [];
      lastAcked = viewSnapshot();
      beforeCommand = null;
      return outside.length > 0 ? { changed_outside_commands: outside } : {};
    },
  };
}

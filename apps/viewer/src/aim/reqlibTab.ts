/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Karta knižnice požiadaviek (AIM D-182) z tlačidla v ribbone AIM: otvorí sa (alebo prepne) na celú plochu.
 * Do dlaždíc nepatrí, preto pri dlaždiciach sa plocha vráti na jedno okno. Lenivo z `DocumentsRibbonTab.tsx`.
 */

import { commit } from './viewTabsApply.js';
import { openTab, REQ_TAB } from './viewTabsPlan.js';
import { singleTiles } from './viewTilesPlan.js';
import { useAimViewTabs } from './viewTabsStore.js';

export function openRequirementsLibrary(): void {
  const s = useAimViewTabs.getState();
  commit(openTab({ tabs: s.tabs, activeId: s.activeId, besideId: s.besideId }, REQ_TAB), s.layout !== 'single' ? singleTiles() : undefined);
}

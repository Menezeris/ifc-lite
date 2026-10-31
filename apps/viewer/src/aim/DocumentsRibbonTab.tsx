/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Ribbon · AIM tab (tab id `documents`, labelled "AIM" since D-089): the
 * fork's own ribbon tab, gathering the AIM-layer surfaces that upstream's
 * five tabs have no home for:
 *
 *   · Documents  — the project document library (D-075), `documents` panel
 *   · Underlays  — georeferenced PDF drawing underlays (D-072)
 *   · (the 3D | 2D | Split switch moved to the view tab bar above the center, AIM D-132)
 *   · Derivations: the AIM derivations layer (D-089, DerivationsRibbonGroup.tsx),
 *     whose rules open the `aim-layers` panel (D-104)
 *
 * Nothing new and nothing moved out from under anyone: every button drives
 * the same store action the classic toolbar and the sidebar rail already
 * drive, so both toolbar styles keep offering the identical command set.
 * Since the ribbon became the default toolbar (upstream #1880), these were
 * reachable there only via the sidebar rail — this tab is the missing
 * ribbon-side entry point.
 *
 * The tab body lives here, under `src/aim/`, so upstream (which has no such
 * file) can never conflict with it; the two-line wiring into the ribbon
 * itself is bracketed with `AIM-FORK` sentinels — see docs/FORK_MAINTENANCE.md.
 */

import { lazy, Suspense } from 'react';
import { Files, Map as MapIcon, Package } from 'lucide-react';
import { DisplayAll, HideSelected, List, Refresh } from '@/icons';
import { useViewerStore } from '@/store';
import {
  RibbonGroup,
  RibbonGroupDivider,
  RibbonContentLargeButton,
} from '@/components/viewer/ribbon/primitives';
import { RibbonCommandLargeButton } from '@/components/viewer/ribbon/command-button';
import type { SurfaceCommandContext } from '@/components/viewer/surface-commands';
import { useAimDerivationsStore } from './aimDerivationsStore';
import { safeManageUrl } from './derivations';
import type { DerivationsRibbonUi } from './DerivationsRibbonGroup';
import type { IcddRibbonUi } from './AimIcddRibbonGroup';
import { icddHostAvailable, requestIcddCheck, requestIcddExport, useAimIcdd } from './aimIcddStore';
import { isBusy } from './icddPlan';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

// Lazy: the Derivations group (D-089) loads when the AIM tab is first opened.
// It gets the entry-chunk primitives and icons from here, not by import.
const DerivationsRibbonGroup = lazy(() =>
  import('./DerivationsRibbonGroup').then((m) => ({ default: m.DerivationsRibbonGroup })),
);
// Lazy: the ICDD group (D-181) with its menu primitives from the entry chunk.
const AimIcddRibbonGroup = lazy(() =>
  import('./AimIcddRibbonGroup').then((m) => ({ default: m.AimIcddRibbonGroup })),
);
const ICDD_UI: IcddRibbonUi = {
  Group: RibbonGroup,
  Button: RibbonContentLargeButton,
  menu: { Menu: DropdownMenu, Trigger: DropdownMenuTrigger, Content: DropdownMenuContent, Item: DropdownMenuItem } as IcddRibbonUi['menu'],
  icon: Package,
};
const DERIVATIONS_UI: DerivationsRibbonUi = {
  Group: RibbonGroup,
  Button: RibbonContentLargeButton,
  icons: { shown: DisplayAll, hidden: HideSelected, rules: List, recompute: Refresh },
};

export function DocumentsRibbonTab() {
  // The two fork panels are single-tenant sidebar panels like every other
  // one, so their store flag IS the latched state (same read the mobile
  // toolbar uses); `toggleWorkspacePanel` handles the docking rules.
  const documentsPanelVisible = useViewerStore((s) => s.documentsPanelVisible);
  const underlayPanelVisible = useViewerStore((s) => s.underlayPanelVisible);

  const icddBusy = useAimIcdd((st) => isBusy(st.run));
  const derivationsLayer = useAimDerivationsStore((s) => s.layer);
  const relationsVisible = useAimDerivationsStore((s) => s.relationsVisible);
  // AIM layers are a workspace panel of the AIM rail group (D-104), toggled like the library panels.
  const layersOpen = useViewerStore((s) => s.sidebarActivePanel === 'aim-layers');
  const toggleLayers = () => useViewerStore.getState().toggleWorkspacePanel('aim-layers', 'ribbon');
  // The library buttons run the same registered `panel:*` commands as the
  // command palette (surface-commands-panels.ts), so ribbon and palette share
  // one label and one action.
  const commandContext: Omit<SurfaceCommandContext, 'surface'> = {
    activateRightPanel: (panel) => useViewerStore.getState().toggleWorkspacePanel(panel, 'ribbon'),
  };

  return (
    <>
      <RibbonGroup label="Library">
        <RibbonCommandLargeButton
          commandId="panel:documents"
          icon={Files}
          tooltip="Project documents (PDFs & images) — open as tabs"
          active={documentsPanelVisible}
          commandContext={commandContext}
        />
        <RibbonCommandLargeButton
          commandId="panel:drawing-underlay"
          icon={MapIcon}
          tooltip="Drawing underlays — georeferenced PDF plans"
          active={underlayPanelVisible}
          commandContext={commandContext}
        />
      </RibbonGroup>

      <RibbonGroupDivider />

      <Suspense fallback={null}>
        <DerivationsRibbonGroup
          ui={DERIVATIONS_UI}
          layer={derivationsLayer}
          manageUrl={safeManageUrl(derivationsLayer?.manageUrl)}
          relationsVisible={relationsVisible}
          layersOpen={layersOpen}
          onToggleRelations={() => useAimDerivationsStore.getState().toggleRelationsVisible()}
          onToggleLayers={toggleLayers}
        />
      </Suspense>

      <RibbonGroupDivider />

      <Suspense fallback={null}>
        <AimIcddRibbonGroup
          ui={ICDD_UI}
          hostAvailable={icddHostAvailable()}
          busy={icddBusy}
          onExport={requestIcddExport}
          onCheck={requestIcddCheck}
        />
      </Suspense>
    </>
  );
}

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
 *   · 3D | 2D | Split (+ storey) — the workspace view mode (D-075)
 *   · Derivations: the AIM derivations layer (D-089, DerivationsRibbonGroup.tsx)
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
import { Columns2, Files, Map as MapIcon } from 'lucide-react';
import { DisplayAll, HideSelected, IsometricView, List, Refresh, TopView } from '@/icons';
import { useViewerStore } from '@/store';
import { useViewMode } from '@/hooks/useViewMode';
import { viewModeDisabledReason } from '@/hooks/viewModeCore';
import { VIEW_MODES, StoreyPicker } from '@/components/viewer/ViewModeSwitcher';
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

// Lazy: the Derivations group (D-089) loads when the AIM tab is first opened.
// It gets the entry-chunk primitives and icons from here, not by import.
const DerivationsRibbonGroup = lazy(() =>
  import('./DerivationsRibbonGroup').then((m) => ({ default: m.DerivationsRibbonGroup })),
);
const DERIVATIONS_UI: DerivationsRibbonUi = {
  Group: RibbonGroup,
  Button: RibbonContentLargeButton,
  icons: { shown: DisplayAll, hidden: HideSelected, rules: List, recompute: Refresh },
};

/** Ribbon icons for the view modes, keyed by the shared `VIEW_MODES` ids. */
const MODE_ICONS = {
  '3d': IsometricView,
  '2d': TopView,
  split: Columns2,
} as const;

export function DocumentsRibbonTab() {
  // The two fork panels are single-tenant sidebar panels like every other
  // one, so their store flag IS the latched state (same read the mobile
  // toolbar uses); `toggleWorkspacePanel` handles the docking rules.
  const documentsPanelVisible = useViewerStore((s) => s.documentsPanelVisible);
  const underlayPanelVisible = useViewerStore((s) => s.underlayPanelVisible);
  const calibrating = useViewerStore((s) => s.underlayCalibration !== null);

  const { mode, setMode, storeys } = useViewMode();
  const derivationsLayer = useAimDerivationsStore((s) => s.layer);
  const relationsVisible = useAimDerivationsStore((s) => s.relationsVisible);
  const layersOpen = useAimDerivationsStore((s) => s.layersOpen);
  const toggleLayers = () => {
    const open = !useAimDerivationsStore.getState().layersOpen;
    useAimDerivationsStore.getState().setLayersOpen(open);
    // The AIM LAYERS section lives in the tree panel; opening it shows the panel.
    if (open && useViewerStore.getState().leftPanelCollapsed) useViewerStore.getState().setLeftPanelCollapsed(false);
  };
  const disabledReason = viewModeDisabledReason({ calibrating, storeyCount: storeys.length });
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

      {/* Same control as the classic toolbar's segmented switcher, in ribbon
          shape: identical modes, identical gating, identical storey picker. */}
      <RibbonGroup label="View mode">
        {VIEW_MODES.map((m) => (
          <RibbonContentLargeButton
            key={m.id}
            icon={MODE_ICONS[m.id]}
            contentLabel={m.label}
            contentSource="extension"
            contentId={`aim-view-mode:${m.id}`}
            tooltip={disabledReason ?? m.title}
            active={mode === m.id}
            disabled={disabledReason !== null}
            onClick={() => setMode(m.id)}
          />
        ))}
        <div className="flex h-full items-center pl-1">
          <StoreyPicker className="h-7" />
        </div>
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
    </>
  );
}

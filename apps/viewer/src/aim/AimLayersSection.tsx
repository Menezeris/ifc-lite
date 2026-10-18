/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AIM LAYERS - collapsible tree-panel section under MODELS (D-089 phase B),
 * one row per derivation rule (AimLayersSectionBody.tsx, loaded lazily).
 *
 * Mounted by AIM-FORK lines in HierarchyPanel. Renders nothing until the host
 * sent AIM_DERIVATIONS_LOAD, so the standalone viewer is unchanged.
 */

import { lazy, Suspense } from 'react';
import { ChevronRight, ExternalLink, GitBranch } from 'lucide-react';
import { useAimDerivationsStore } from './aimDerivationsStore';
import { safeManageUrl } from './derivations';
import type { AimLayersIcons } from './AimLayersSectionBody';

const AimLayersSectionBody = lazy(() =>
  import('./AimLayersSectionBody').then((m) => ({ default: m.AimLayersSectionBody })),
);
const ICONS: AimLayersIcons = { chevron: ChevronRight, section: GitBranch, link: ExternalLink };

export function AimLayersSection() {
  const layer = useAimDerivationsStore((s) => s.layer);
  const open = useAimDerivationsStore((s) => s.layersOpen);
  const hiddenRuleIds = useAimDerivationsStore((s) => s.hiddenRuleIds);
  const relationsVisible = useAimDerivationsStore((s) => s.relationsVisible);
  const toggleRuleVisible = useAimDerivationsStore((s) => s.toggleRuleVisible);
  const setLayersOpen = useAimDerivationsStore((s) => s.setLayersOpen);
  if (!layer) return null;
  return (
    <Suspense fallback={null}>
      <AimLayersSectionBody
        layer={layer}
        manageUrl={safeManageUrl(layer.manageUrl)}
        open={open}
        hiddenRuleIds={hiddenRuleIds}
        relationsVisible={relationsVisible}
        icons={ICONS}
        onToggleRule={toggleRuleVisible}
        onSetOpen={setLayersOpen}
      />
    </Suspense>
  );
}

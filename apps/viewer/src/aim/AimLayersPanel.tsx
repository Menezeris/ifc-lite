/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AIM layers panel (D-089, moved to the AIM rail group by D-104): one row per
 * derivation rule of the AIM host (AimLayersPanelBody.tsx). Until the host sent
 * AIM_DERIVATIONS_LOAD (standalone viewer, older host) it says where the layer
 * comes from instead of an empty list.
 *
 * The panel body is lazy (renderPanelBody), so it may import the store and icons.
 */

import { ExternalLink, GitBranch, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAimDerivationsStore } from './aimDerivationsStore';
import { AimLayersPanelBody } from './AimLayersPanelBody';
import { safeManageUrl } from './derivations';

export function AimLayersPanel({ onClose }: { onClose: () => void }) {
  const layer = useAimDerivationsStore((s) => s.layer);
  const hiddenRuleIds = useAimDerivationsStore((s) => s.hiddenRuleIds);
  const relationsVisible = useAimDerivationsStore((s) => s.relationsVisible);
  const toggleRuleVisible = useAimDerivationsStore((s) => s.toggleRuleVisible);
  const manageUrl = layer ? safeManageUrl(layer.manageUrl) : null;
  return (
    <div className="flex h-full flex-col overflow-hidden" data-aim-layers-panel>
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        <GitBranch className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="flex-1 text-xs font-semibold">AIM vrstvy</span>
        {layer && <span className="text-2xs font-mono text-muted-foreground">{layer.rules.length}</span>}
        {manageUrl && (
          <a
            href={manageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary"
            title="Spravovať pravidlá (GitHub workflow odvodenie); viewer sa obnoví sám po novej revízii"
            aria-label="Spravovať pravidlá"
          >
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
        <Button variant="ghost" size="icon" className="size-6" onClick={onClose} aria-label="Zavrieť AIM vrstvy">
          <X className="size-3.5" aria-hidden />
        </Button>
      </div>
      {layer ? (
        <AimLayersPanelBody
          layer={layer}
          hiddenRuleIds={hiddenRuleIds}
          relationsVisible={relationsVisible}
          onToggleRule={toggleRuleVisible}
        />
      ) : (
        <p className="p-6 text-center text-xs text-muted-foreground">
          Pravidlá odvodení posiela AIMviewer. Vo viewer bez AIMviewera nie sú.
        </p>
      )}
    </div>
  );
}

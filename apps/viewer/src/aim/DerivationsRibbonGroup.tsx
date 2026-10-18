/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Ribbon - AIM tab - Derivations group (D-089 phase B) - view controls for
 * the AIM layer over the models:
 *
 *   - AIM vzťahy  - local eye: show/hide derived relations in Relationship records
 *   - Pravidlá    - expand/collapse the AIM LAYERS section in the tree panel
 *   - Prepočítať  - open `layer.manageUrl` (GitHub workflow `odvodenie`)
 *
 * Nothing here posts to the host: the eye and the section are viewer-local
 * state, and every data change (recompute, enable/disable a rule) happens at
 * the manage link until the viewer may write (phase 3). Without a layer
 * (no AIM_DERIVATIONS_LOAD) the group stays visible but disabled.
 *
 * The buttons are tagged `data-ribbon-extension` so the ribbon command-label
 * guard counts them as fork contributions, not as unregistered raw controls.
 */

import { DisplayAll, HideSelected, List, Refresh } from '@/icons';
import { useViewerStore } from '@/store';
import { RibbonGroup, RibbonContentLargeButton } from '@/components/viewer/ribbon/primitives';
import { useAimDerivationsStore } from './aimDerivationsStore';
import { safeManageUrl } from './derivations';

const NO_LAYER = 'AIM vrstva nie je k dispozícii (host ju neposlal)';

export function DerivationsRibbonGroup() {
  const layer = useAimDerivationsStore((s) => s.layer);
  const relationsVisible = useAimDerivationsStore((s) => s.relationsVisible);
  const layersOpen = useAimDerivationsStore((s) => s.layersOpen);
  const manageUrl = safeManageUrl(layer?.manageUrl);

  const toggleLayers = () => {
    const { setLayersOpen } = useAimDerivationsStore.getState();
    const open = !layersOpen;
    setLayersOpen(open);
    // The section lives in the tree panel; opening it must also show the panel.
    if (open && useViewerStore.getState().leftPanelCollapsed) {
      useViewerStore.getState().setLeftPanelCollapsed(false);
    }
  };

  return (
    <RibbonGroup label="Derivations">
      <RibbonContentLargeButton
        icon={relationsVisible ? DisplayAll : HideSelected}
        contentLabel="AIM vzťahy"
        contentSource="extension"
        contentId="aim-derivations:relations"
        data-ribbon-extension="aim-derivations:relations"
        tooltip={layer ? 'Zobraziť/skryť odvodené AIM vzťahy v paneli vlastností (len lokálne)' : NO_LAYER}
        active={layer ? relationsVisible : undefined}
        disabled={!layer}
        onClick={() => useAimDerivationsStore.getState().toggleRelationsVisible()}
      />
      <RibbonContentLargeButton
        icon={List}
        contentLabel="Pravidlá"
        contentSource="extension"
        contentId="aim-derivations:rules"
        data-ribbon-extension="aim-derivations:rules"
        tooltip={layer ? 'Pravidlá odvodení: sekcia AIM VRSTVY v ľavom paneli' : NO_LAYER}
        active={layer ? layersOpen : undefined}
        disabled={!layer}
        onClick={toggleLayers}
      />
      <RibbonContentLargeButton
        icon={Refresh}
        contentLabel="Prepočítať"
        contentSource="extension"
        contentId="aim-derivations:recompute"
        data-ribbon-extension="aim-derivations:recompute"
        tooltip={
          !layer
            ? NO_LAYER
            : manageUrl
              ? 'Prepočet a zapnutie/vypnutie pravidiel sa robí v GitHub workflow odvodenie; viewer sa obnoví sám po novej revízii'
              : 'Odkaz na správu pravidiel host neposlal'
        }
        disabled={!manageUrl}
        onClick={() => {
          if (manageUrl) window.open(manageUrl, '_blank', 'noopener,noreferrer');
        }}
      />
    </RibbonGroup>
  );
}

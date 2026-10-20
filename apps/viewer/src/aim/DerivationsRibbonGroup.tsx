/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Ribbon - AIM tab - Derivations group (D-089 phase B) - view controls for
 * the AIM layer over the models:
 *
 *   - AIM vzťahy  - local eye: show/hide derived relations in Relationship records
 *   - Pravidlá    - open/close the AIM layers panel of the AIM rail group (D-104)
 *   - Prepočítať  - open `layer.manageUrl` (GitHub workflow `odvodenie`)
 *
 * Nothing here posts to the host: the eye and the section are viewer-local
 * state, and every data change (recompute, enable/disable a rule) happens at
 * the manage link until the viewer may write (phase 3). Without a layer
 * (no AIM_DERIVATIONS_LOAD) the group stays visible but disabled.
 *
 * The buttons are tagged `data-ribbon-extension` so the ribbon command-label
 * guard counts them as fork contributions, not as unregistered raw controls.
 * Loaded lazily by DocumentsRibbonTab, which passes in the store state, the
 * ribbon primitives and the icons: importing them here would pull those entry
 * modules out into shared eager chunks (docs/FORK_MAINTENANCE.md).
 */

import type { ComponentType } from 'react';
import type { RibbonGroup, RibbonContentLargeButton } from '@/components/viewer/ribbon/primitives';
import type { DerivationsLayerWire } from './derivations-protocol';

const NO_LAYER = 'AIM vrstva nie je k dispozícii (host ju neposlal)';

/** Entry-chunk UI the caller hands in (see the header comment). */
export interface DerivationsRibbonUi {
  Group: typeof RibbonGroup;
  Button: typeof RibbonContentLargeButton;
  icons: { shown: ComponentType; hidden: ComponentType; rules: ComponentType; recompute: ComponentType };
}

export interface DerivationsRibbonGroupProps {
  ui: DerivationsRibbonUi;
  layer: DerivationsLayerWire | null;
  /** `layer.manageUrl` when safe to open (http/https), else null. */
  manageUrl: string | null;
  relationsVisible: boolean;
  layersOpen: boolean;
  onToggleRelations: () => void;
  onToggleLayers: () => void;
}

export function DerivationsRibbonGroup({ ui, layer, manageUrl, relationsVisible, layersOpen, onToggleRelations, onToggleLayers }: DerivationsRibbonGroupProps) {
  const { Group, Button, icons } = ui;
  return (
    <Group label="Derivations">
      <Button
        icon={relationsVisible ? icons.shown : icons.hidden}
        contentLabel="AIM vzťahy"
        contentSource="extension"
        contentId="aim-derivations:relations"
        data-ribbon-extension="aim-derivations:relations"
        tooltip={layer ? 'Zobraziť/skryť odvodené AIM vzťahy v paneli vlastností (len lokálne)' : NO_LAYER}
        active={layer ? relationsVisible : undefined}
        disabled={!layer}
        onClick={onToggleRelations}
      />
      <Button
        icon={icons.rules}
        contentLabel="Pravidlá"
        contentSource="extension"
        contentId="aim-derivations:rules"
        data-ribbon-extension="aim-derivations:rules"
        tooltip={layer ? 'Pravidlá odvodení: panel AIM vrstvy v pravej lište' : NO_LAYER}
        active={layer ? layersOpen : undefined}
        disabled={!layer}
        onClick={onToggleLayers}
      />
      <Button
        icon={icons.recompute}
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
    </Group>
  );
}

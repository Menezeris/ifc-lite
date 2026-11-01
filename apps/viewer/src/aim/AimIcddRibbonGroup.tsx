/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Ribbon AIM, skupina ICDD (D-181): tlačidlo "ICDD" s menu "Exportovať ICDD" a "Skontrolovať ICDD...".
 * Prácu robí host (D-091); tu len žiadosť (`aimIcddStore`). Lenivo z `DocumentsRibbonTab`, ktorý
 * dodá primitíva ribbonu a menu z vstupného balíka (importom by sa vytiahli do zdieľaného chunku).
 */

import { useRef, type ComponentType, type ElementType, type ReactNode } from 'react';
import type { RibbonGroup, RibbonContentLargeButton } from '@/components/viewer/ribbon/primitives';
import { ICDD_NO_HOST } from './icddPlan';

export interface IcddMenuUi {
  Menu: ComponentType<{ children: ReactNode }>;
  Trigger: ComponentType<{ asChild?: boolean; children: ReactNode }>;
  Content: ComponentType<{ align?: 'start' | 'center' | 'end'; children: ReactNode }>;
  Item: ComponentType<{ disabled?: boolean; onSelect?: () => void; children: ReactNode }>;
}

export interface IcddRibbonUi {
  Group: typeof RibbonGroup;
  Button: typeof RibbonContentLargeButton;
  menu: IcddMenuUi;
  icon: ElementType;
}

export interface AimIcddRibbonGroupProps {
  ui: IcddRibbonUi;
  /** Host je pripojený (embed). */
  hostAvailable: boolean;
  busy: boolean;
  onExport: () => void;
  onCheck: (name: string, bytes: ArrayBuffer) => void;
}

export function AimIcddRibbonGroup({ ui, hostAvailable, busy, onExport, onCheck }: AimIcddRibbonGroupProps) {
  const { Group, Button, menu, icon } = ui;
  const input = useRef<HTMLInputElement>(null);
  const disabled = !hostAvailable || busy;
  return (
    <Group label="ICDD">
      <menu.Menu>
        <menu.Trigger asChild>
          <Button
            icon={icon}
            contentLabel="ICDD"
            contentSource="extension"
            contentId="aim-icdd:menu"
            data-ribbon-extension="aim-icdd:menu"
            tooltip={hostAvailable ? 'ICDD kontajner: export z AIM a kontrola súboru .icdd' : ICDD_NO_HOST}
            hasMenu
            disabled={!hostAvailable}
          />
        </menu.Trigger>
        <menu.Content align="start">
          <menu.Item disabled={disabled} onSelect={onExport}>Exportovať ICDD</menu.Item>
          <menu.Item disabled={disabled} onSelect={() => input.current?.click()}>Skontrolovať ICDD...</menu.Item>
        </menu.Content>
      </menu.Menu>
      <input
        ref={input}
        type="file"
        accept=".icdd,.zip"
        hidden
        data-testid="aim-icdd-file"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = ''; // rovnaký súbor sa dá vybrať znova
          if (!file) return;
          void file.arrayBuffer().then((bytes) => onCheck(file.name, bytes));
        }}
      />
    </Group>
  );
}

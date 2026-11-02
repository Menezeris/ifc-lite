/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Ribbon AIM, skupina Overovanie (D-185 UI): tlačidlo s rozbaľovacím zoznamom kontrol (`VERIFY_CHECKS`, zatiaľ
 * "Výmery miestností (IfcSpace)"). Klik na kontrolu overí naraz všetky prvky v modeli, beh uloží host k revízii.
 * Bez toho sa prvok overí až pri zobrazení jeho výmer. Lenivo z `DocumentsRibbonTab`, ktorý dodá primitíva
 * ribbonu a menu (ako skupina ICDD).
 */

import type { ElementType } from 'react';
import type { IcddRibbonUi } from './AimIcddRibbonGroup';
import { VERIFY_CHECKS, type VerifyCheckId } from './aimVerifyStore';

export interface VerifyRibbonUi extends Omit<IcddRibbonUi, 'icon'> {
  icon: ElementType;
}

export interface AimVerifyRibbonGroupProps {
  ui: VerifyRibbonUi;
  hostAvailable: boolean;
  /** Práve bežiaca kontrola (tlačidlá sa vypnú). */
  busyCheck: string | null;
}

const run = (check: VerifyCheckId) => void import('./aimVerify').then((m) => m.runAllVerification(check));

export function AimVerifyRibbonGroup({ ui, hostAvailable, busyCheck }: AimVerifyRibbonGroupProps) {
  const { Group, Button, menu, icon } = ui;
  const busyLabel = VERIFY_CHECKS.find((c) => c.id === busyCheck)?.label;
  const tooltip = !hostAvailable
    ? 'Overovanie beží len vo vieweri v AIM'
    : busyLabel
      ? `Overujem: ${busyLabel}...`
      : 'Overiť naraz všetky prvky modelu podľa kontroly; výsledok sa uloží k revízii';
  return (
    <Group label="Overovanie">
      <menu.Menu>
        <menu.Trigger asChild>
          <Button
            icon={icon}
            contentLabel={busyLabel ? 'Overujem...' : 'Overiť'}
            contentSource="extension"
            contentId="aim-verify:menu"
            data-ribbon-extension="aim-verify:menu"
            tooltip={tooltip}
            hasMenu
            disabled={!hostAvailable}
          />
        </menu.Trigger>
        <menu.Content align="start">
          {VERIFY_CHECKS.map((c) => (
            <menu.Item key={c.id} disabled={!hostAvailable || busyCheck !== null} onSelect={() => run(c.id)}>
              {c.label}
            </menu.Item>
          ))}
        </menu.Content>
      </menu.Menu>
    </Group>
  );
}

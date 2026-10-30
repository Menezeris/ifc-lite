/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Text pri "Calibrate" na podklade rezu (AIMviewer #284): rez sa kalibruje v AIM (calibrate_underlay
 * so section_plane), postup panela je pre pôdorys a podklad by preklopil na podlažie.
 */

import { useTranslation } from '@/i18n';

export function useSectionCalibrateNote(): string {
  const { t } = useTranslation();
  return t('aimFork.sectionUnderlay.calibrateNote');
}

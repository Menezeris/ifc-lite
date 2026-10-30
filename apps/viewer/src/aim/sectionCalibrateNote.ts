/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Calibrate" na podklade rezu (AIMviewer #284): rez sa kalibruje v AIM (calibrate_underlay so
 * section_plane), postup panela je pre pôdorys a podklad by preklopil na podlažie. Strážca ukáže
 * poznámku a vráti true; panel (na rozpočte veľkosti modulu) potom len skončí.
 */

import { toast } from '@/components/ui/toast';
import { useTranslation } from '@/i18n';

export function useSectionCalibrateGuard(): (placement: { plane?: unknown } | null) => boolean {
  const { t } = useTranslation();
  return (placement) => {
    if (!placement?.plane) return false;
    toast.info(t('aimFork.sectionUnderlay.calibrateNote'));
    return true;
  };
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Box cut" v kontextovom menu prvku (AIM, ako v Daluxe): rezný box okolo
 * kliknutého prvku, pre miestnosť so skladbami podlahy, stropu a stien.
 * Menu zatvára Radix pri výbere; tu sa len povie, keď box nebolo z čoho spraviť.
 */

import { toast } from '@/components/ui/toast';
import { addBoxCut } from './sectionBoxScene';

export function runBoxCut(entityId: number, failedMessage: string): void {
  if (!addBoxCut([entityId])) toast.error(failedMessage);
}

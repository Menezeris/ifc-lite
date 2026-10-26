/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Georeferencing map on request (AIM, startup load). The upstream `LocationMap` mounts at the
 * bottom of the model metadata panel, so maplibre and the basemap tiles loaded as soon as the
 * viewer opened with nothing selected. Here the map sits behind a section that is closed by
 * default; it mounts (and loads maplibre) only after the user opens it.
 */

import { ChevronRight } from 'lucide-react';
import { useViewerStore } from '@/store';
import { useTranslation } from '@/i18n';
import { LocationMap, type LocationMapProps } from '@/components/viewer/properties/LocationMap';
import { usePersistentDisclosure } from '@/components/viewer/properties/usePersistentDisclosure';

export type { PickedPosition } from '@/components/viewer/properties/LocationMap';

type AimMapSectionProps = Omit<LocationMapProps, 'dataStore' | 'modelName'> & { modelId?: string };

export function AimMapSection({ modelId, ...mapProps }: AimMapSectionProps) {
  const { t } = useTranslation();
  const [open, setOpen] = usePersistentDisclosure('georef-map', false);
  const model = useViewerStore((s) => (modelId ? s.models.get(modelId) : undefined));
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1 text-xs text-teal-500 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} />
        {t('aimFork.georefMap.toggle')}
      </button>
      {open && <LocationMap {...mapProps} dataStore={model?.ifcDataStore ?? undefined} modelName={model?.name} />}
    </>
  );
}

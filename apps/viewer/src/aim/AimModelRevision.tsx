/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Model revision pill ("v72") on a MODELS tree row (D-089 phase B), paired by
 * model key (file name without extension) with `layer.models`. Mounted by one
 * AIM-FORK line in ModelHeaderRow; renders nothing without a layer or match.
 */

import { useAimDerivationsStore } from './aimDerivationsStore';
import { modelKey, revisionForModel } from './derivations';

export function AimModelRevision({ modelName }: { modelName: string }) {
  const revision = useAimDerivationsStore((s) => (s.layer ? revisionForModel(s.layer.models, modelName) : null));
  if (revision === null) return null;
  return (
    <span
      className="text-2xs font-mono px-1 border border-primary/40 text-primary rounded-none shrink-0"
      title={`AIM revízia modelu ${modelKey(modelName)} v${revision}`}
      data-aim-model-revision
    >
      v{revision}
    </span>
  );
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Everything the upstream HierarchyPanel takes from the AIM layer, behind one
 * import line: tree decorations (D-077). AIM LAYERS moved to its own panel (D-104).
 * HierarchyPanel sits at its module-size budget, so its AIM-FORK wiring has
 * to stay as short as possible (docs/FORK_MAINTENANCE.md).
 */

export { useAimDecorationsStore } from './aimDecorationsStore';
export { guidForEntity, type AimTreeDecoration } from './bridge-protocol';

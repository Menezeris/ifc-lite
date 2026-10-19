<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-113 properties panel from chat: surgical mutation evidence

The AIM host's `SELECT` can now carry an optional `panel` (AIMviewer #71). The lazily loaded `SELECT` handler validates it (`aimPanelViewPlan.ts`; an invalid panel drops the whole message, nothing is selected) and, after the element is selected, switches the AIM | IFC inspector tab (the store moved to `aim/aimInspectorStore.ts`), the upstream panel section (`propertiesActiveTab`: properties or quantities) and highlights a property through upstream `pendingPropertyFocus`, the path the bSDD card's "Edit in Properties" already takes (opens the property set, scrolls, highlights the row). A focus from the chat must not enter edit mode, so `PropertiesPanel.tsx` gets one condition in a one-line `AIM-FORK` block that skips `setEditEnabled(true)` for a focus object marked by the AIM layer (the file sits at its size budget; the import rides the existing `AimInspectorTabs` import). The pure part is the new `aimPanelViewPlan.ts`; its test (`aimPanelViewPlan.test.ts`) imports it, so reverting production to the base makes the test fail to load and the CI revert oracle reports `REVERT-BROKE-BUILD`. Each behavioural decision was instead checked with a surgical mutation.

Each patch is written mutant→fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Mutation | Test that went red |
|---|---|---|
| `invalid-panel-kept.patch` | an invalid panel is treated like a missing one, so the element is selected anyway | `aimPanelViewPlan.test.ts` |
| `tab-unchecked.patch` | any tab name is accepted | `aimPanelViewPlan.test.ts` |
| `section-unchecked.patch` | any section is accepted (also bsdd, raw-step) | `aimPanelViewPlan.test.ts` |
| `focus-without-property.patch` | a focus without a property name is accepted | `aimPanelViewPlan.test.ts` |
| `focus-keeps-tab.patch` | a focus keeps the requested tab and section, so the row stays hidden under the AIM tab or in Quantities | `aimPanelViewPlan.test.ts` |
| `section-stays-under-aim.patch` | a section without a tab does not switch to IFC, so the change is invisible under the AIM tab | `aimPanelViewPlan.test.ts` |

All patches mutate `aimPanelViewPlan.ts`. The first run of `invalid-panel-kept` came back `UNOBSERVED`: the test compared with `assert.equal`, for which `undefined == null`; the null checks now use `assert.strictEqual`.

`aimPanelView.ts` (store glue, waits for the selection before arming the focus), the `SELECT` wiring in `visibility-commands.ts` and the `PropertiesPanel.tsx` condition have no unit test. They were verified live: local fork viewer embedded in a host page, `AC20-FZK-Haus.ifc`, Playwright posting `SELECT` with a panel while the host answered `ENTITY_SELECTED` with an AIM card. `focus: Pset_WallCommon.ThermalTransmittance` switched to IFC / Properties, the row was rendered and highlighted, and `editEnabled` stayed false; `section: quantities` switched the section; `tab: aim` switched back to the AIM card; `tab: raw` was dropped (selection unchanged).

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/aimPanelViewPlan.ts \
  --test apps/viewer/src/aim/aimPanelViewPlan.test.ts \
  --mutation /tmp/d113-mut/tab-unchecked.patch --ci --json
```

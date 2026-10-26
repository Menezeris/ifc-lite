/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AIM fork: strings for the fork-only workspace panels (D-072 drawing
 * underlays, D-075 project documents). A separate catalogue so upstream
 * catalogues stay untouched (docs/FORK_MAINTENANCE.md).
 */
export const aimForkEn = {
  'aimFork.panel.drawingUnderlay': 'Drawing underlays',
  'aimFork.panel.documents': 'Documents',
  'aimFork.panel.aimLayers': 'AIM layers',
  /** Header of the small AIM chat legend card (#218): a plain title, not the technical lens name. */
  'aimFork.ids.save': 'Save to AIM',
  'aimFork.ids.saving': 'Saving to AIM...',
  'aimFork.ids.saved': 'Saved to AIM as {code}, version {version}.',
  'aimFork.ids.conflict': 'Not saved: AIM already has a newer version ({latest}). Reload this IDS from AIM, or ask the chat to compare the versions.',
  'aimFork.ids.error': 'Not saved: {reason}',
  'aimFork.ids.linked': 'From AIM: {code}, version {version}.',
  'aimFork.ids.linkedEdited': 'From AIM: {code}, version {version} (edited, not saved).',
  'aimFork.ids.unlinked': 'Not in AIM yet. Saving creates a new IDS there.',
  'aimFork.ids.specNotFound': 'Specification "{spec}" was not found in this IDS.',
  'aimFork.clash.save': 'Save to AIM',
  'aimFork.clash.saving': 'Saving to AIM...',
  'aimFork.clash.saved': 'Saved to AIM: {results} results, {reviews} status changes.',
  'aimFork.clash.error': 'Not saved: {reason}',
  'aimFork.clash.linked': 'From AIM: {code}.',
  'aimFork.clash.linkedEdited': 'From AIM: {code} (edited, not saved).',
  'aimFork.clash.unlinked': 'Not in AIM yet. Run one rule (sets A and B), then saving creates a new clash test there.',
  'aimFork.clash.matched': 'Saved pairs found again: {found}, missing: {missing}.',
  'aimFork.legend.title': 'Legend',
  /** Presentation view card (D-161): shows the view in a new tile next to the 3D view. */
  'aimFork.views.openInNewTile': 'Open in a new tile',
  /** Rail / ribbon / palette group of the AIM panels (D-104), first of all groups. */
  'aimFork.panelGroups.aim': 'AIM',
  'aimFork.panelGroups.aimDescription': 'AIM platform: project documents, derived layers and drawing underlays from the AIM host',
  /** Assistant source picker: why the fork panels are not discussable (#6833 charter). */
  'aimFork.assistant.boundaryDrawingUnderlay': 'Georeferenced PDF plan underlays. Placing or calibrating a drawing produces no analysis result to discuss.',
  'aimFork.assistant.boundaryAimLayers': 'Derivation rules of the AIM platform. Showing or hiding a rule produces no analysis result; the rules run in the AIM host.',
  'aimFork.assistant.boundaryDocuments': 'Project document library. Opening a PDF or image produces no analysis result; the documents themselves live in the AIM platform.',
  /** Underlays panel switch (AIM D-133 addendum, #170): hides the PDF underlays in the 3D view only. */
  'aimFork.underlays3d.label': 'Show in 3D',
  'aimFork.underlays3d.hint': 'Off by default: the PDF drawings are not loaded until you turn this on. Affects the 3D view only; calibration stays saved and the 2D plan is unchanged.',
  /** Camera position and view direction on a calibrated PDF plan (AIM D-161 step 8, #282). */
  'aimFork.planPosition.label': 'Position',
  'aimFork.planPosition.hint': 'Shows the 3D camera position and view direction on the calibrated plan',
  /** Highlighted download button after an export request from the AIM chat (AIM D-149): the browser needs the user's click. */
  'aimFork.listExport.action': 'Download {format}',
  'aimFork.listExport.hint': 'Requested from the AIM chat: click to download',
  'aimFork.listExport.dismiss': 'Dismiss download offer',
  /** Fork-only ribbon tab (D-072 / D-075, labelled AIM since D-089); keyed like upstream's `ribbon.tab.*` because the band reads `t(`ribbon.tab.${tab}`)`. */
  'ribbon.tab.documents': 'AIM',
} as const;

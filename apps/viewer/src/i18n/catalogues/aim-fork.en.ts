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
  'aimFork.legend.title': 'Legend',
  /** Rail / ribbon / palette group of the AIM panels (D-104), first of all groups. */
  'aimFork.panelGroups.aim': 'AIM',
  'aimFork.panelGroups.aimDescription': 'AIM platform: project documents, derived layers and drawing underlays from the AIM host',
  /** Assistant source picker: why the fork panels are not discussable (#6833 charter). */
  'aimFork.assistant.boundaryDrawingUnderlay': 'Georeferenced PDF plan underlays. Placing or calibrating a drawing produces no analysis result to discuss.',
  'aimFork.assistant.boundaryAimLayers': 'Derivation rules of the AIM platform. Showing or hiding a rule produces no analysis result; the rules run in the AIM host.',
  'aimFork.assistant.boundaryDocuments': 'Project document library. Opening a PDF or image produces no analysis result; the documents themselves live in the AIM platform.',
  /** Underlays panel switch (AIM D-133 addendum, #170): hides the PDF underlays in the 3D view only. */
  'aimFork.underlays3d.label': 'Show in 3D',
  'aimFork.underlays3d.hint': 'Hides the PDF drawings in the 3D view only. Calibration stays saved; the 2D plan is unchanged.',
  /** Highlighted download button after an export request from the AIM chat (AIM D-149): the browser needs the user's click. */
  'aimFork.listExport.action': 'Download {format}',
  'aimFork.listExport.hint': 'Requested from the AIM chat: click to download',
  'aimFork.listExport.dismiss': 'Dismiss download offer',
  /** Fork-only ribbon tab (D-072 / D-075, labelled AIM since D-089); keyed like upstream's `ribbon.tab.*` because the band reads `t(`ribbon.tab.${tab}`)`. */
  'ribbon.tab.documents': 'AIM',
} as const;

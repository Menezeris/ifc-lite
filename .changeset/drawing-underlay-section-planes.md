---
"@ifc-lite/drawing-underlay": minor
---

Vertical section underlays: a placement may carry a `plane` (origin, u, v in IFC metres) and a page `region`; `placementWorldCorners` then stands the page on that plane, and `PdfPlanePipeline` draws the side opposite the plane normal with `backOpacity`. New exports `parseGeorefV2Sections`, `serializeSectionCalibration`, `isSectionPlacement`, `SECTION_BACK_OPACITY` and the `SectionPlacement`, `SectionPlane`, `PageRegion` types.

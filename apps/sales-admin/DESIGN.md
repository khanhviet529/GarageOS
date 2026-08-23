# GarageOS Sales Admin Design System

## 01 Product principles

Dense, calm, operational and auditable. The admin supports decisions; it does not market to staff.

## 02 Information hierarchy

Page title and primary action first; status, metadata and secondary actions follow. Tables lead with the value needed to decide.

## 03 Navigation

One persistent functional navigation rail on desktop; a labelled drawer on narrow screens. Do not show routes without a working permission-gated destination.

## 04–08 Color, typography, spacing, grid, surfaces

Neutral canvas, white surfaces, charcoal text and one restrained GarageOS blue. Use the token scale. Hairline borders, low radii, no decorative gradients or glass.

## 09 Tables

Sticky meaning, clear headers, scan-friendly alignment, overflow strategy on narrow screens. Rows are actions only when a visible affordance exists.

## 10 Forms

Label every control, put validation next to the field, reserve destructive actions for explicit confirmation, and retain entered values after server errors.

## 11 Dialogs / drawers

Use for a focused decision or contextual editor only. Escape closes non-destructive overlays; focus returns to the trigger.

## 12 Feedback states

Loading, empty, error and saved states are part of every server-state surface. Error messages use the API error model and retain request IDs.

## 13 Builder UI

Three panels: structure, real landing preview, inspector. The builder controls content and approved variants only—never arbitrary HTML, CSS or scripts.

## 14 Responsive admin behavior

Navigation becomes a drawer. Inspector becomes a sheet. Tables keep meaningful columns and scroll intentionally rather than squeezing data into illegibility.

## 15 Accessibility

Keyboard navigation, visible focus, semantic headings, labelled controls, contrast-safe tokens, reduced motion and drag alternatives are mandatory.

## 16 Do

Use predictable spacing, clear statuses, short action labels, real empty states and contextual help.

## 17 Don't

Do not use glowing blobs, glass surfaces, decorative dashboards, arbitrary rounded cards, color-only statuses or animation without operational meaning.

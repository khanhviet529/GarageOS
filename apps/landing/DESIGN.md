# GarageOS Landing Design System

## Intent

GarageOS is **Automotive Editorial × Ownership Operating System**. The vehicle is the protagonist; the operating system is the proof that ownership continues after delivery.

The homepage follows one sentence: **One car. One continuous ownership journey.** It moves from desire (the vehicle) to evidence (transparent ownership data) to continuity (a durable service record).

This document uses Refero as a method: make the visual system explicit before building components. It does not reproduce any reference site's layout, language, or visual identity.

## Visual direction

- **Vehicle first.** Images occupy complete editorial planes, rather than being framed as decorative card thumbnails. Text sits in deliberately quiet image areas with a contrast scrim only where needed.
- **Charcoal to paper.** The opening is cinematic charcoal. Mid-page switches to a warm neutral paper surface for ownership facts, then returns to charcoal for the commitment and conversion moment. The change marks a change from emotion to evidence, not decoration.
- **Precision without a dashboard.** Hairline rules, tabular numerals and compact uppercase labels express operational clarity. There are no fake gauges, glowing panels, or invented telemetry.
- **One accent.** Signal red is reserved for action, progression and the journey line. It is not a background effect or a second visual theme.
- **Typography does the hierarchy.** Be Vietnam Pro carries both display and UI because its Vietnamese glyphs remain clean at editorial scale. Mono is reserved for labels and factual metadata; weight, scale and spacing—not an ultra-condensed face—create the premium tone.

## Tokens

Tokens are semantic so tenant theming can override values without component CSS containing hard-coded colors.

| Group | Tokens | Use |
| --- | --- | --- |
| Color | `surface-*`, `paper-*`, `text-*`, `line-*`, `brand`, `action` | dark/light editorial polarity, readable content and actions |
| Type | `font-*`, `fs-*`, `lh-*` | display, UI and metadata roles |
| Space | `s-1`…`s-11` | 4px base rhythm; sections use 64–160px intervals |
| Grid | `max-w`, `max-w-wide`, `page-gutter`, `measure` | stable content measure and full-bleed media |
| Surface | `surface-*`, `paper-*`, `line-*` | flat, border-led planes instead of cards/shadows |
| Radius | `r-sm`, `r-md`, `r-lg`, `r-full` | mostly 0–4px; pills only for compact metadata |
| Motion | `ease-out`, `duration-*` | brief image/link feedback only; disabled for reduced motion |

## Homepage rhythm

1. **Hero** — cinematic first impression and two clear routes.
2. **Featured vehicle** — one vehicle receives editorial scale, price and the route into its real 360° experience.
3. **Collection** — a curated, image-led continuation, not a SaaS card grid.
4. **Ownership journey** — the signature continuous record: Discover → Test drive → Purchase → Delivery → Service → Maintenance → History.
5. **Ownership system** — service-cost facts and comparison use data from the tenant's published workshop price list.
6. **Service story** — purchase becomes a traceable after-sales record, without inventing unsupported claims.
7. **Trust** — public price, prepared experience and continuous after-sales service are stated as verifiable commitments.
8. **Final CTA** — a calm conversion moment after evidence has been established.

## Component boundaries

`app/page.tsx` owns server composition only: tenant resolution, API reads, metadata and JSON-LD remain there. `content/home.ts` owns static editorial content. A home component owns one coherent narrative section and its CSS Module. Feature interactions such as the lead form and the 360° viewer remain their existing client boundaries; the homepage itself remains server-rendered.

## Accessibility and performance rules

- Hero is a real image with intrinsic dimensions; only it is high priority. Collection imagery is lazy-loaded and all media containers reserve an aspect ratio to prevent CLS.
- Use semantic headings, lists and links; the journey is readable linearly without its decorative line.
- Global focus-visible and skip-link styles are always available. CTA controls meet a 44px target.
- Decorative image overlays are `aria-hidden`; useful vehicle images have real tenant-provided alt text.
- Motion is limited to opacity/transform and is disabled by `prefers-reduced-motion`.

## CSS ownership

`styles/` contains only tokens, reset, typography, utilities and temporary legacy route compatibility. Homepage section styling lives next to the relevant component. New section rules must not be added to `app/globals.css`.

---
name: icon-guidance
description: "Use when designing or refining icon systems, including web and PWA icons, maskable icons, monochrome themed icons, manifest icon entries, launcher-safe sizing, and icon cache-busting."
---

# Icon Guidance

Use this guidance when defining app icon assets for web installs, home screen launchers, and themed monochrome launcher support.

## Core Rules

1. Treat web icons and mobile launcher icons as related assets with different jobs, not one asset scaled arbitrarily.
2. Keep the web icon visually fuller because browser surfaces usually show the full square canvas.
3. Keep launcher-oriented icons more conservative because launchers often mask them into circles or squircles.
4. Prefer one clear motif across all variants so the assets feel like the same product even when geometry differs.

## Asset Set

Provide these assets when possible:

1. `any`: the normal full-color icon for web and general install surfaces.
2. `maskable`: a dedicated launcher icon with a full background and extra padding around the symbol.
3. `monochrome`: a single-color glyph on a transparent background for themed launcher rendering.

## Composition Guidance

### Web Icon

1. Let the design fill the square more aggressively.
2. Preserve clarity at small sizes, but do not over-optimize for launcher masks.

### Maskable Icon

1. Use a full-bleed background shape or color to the canvas edges.
2. Center the symbol and give it breathing room so masking does not clip essential content.
3. Keep all important content well inside the safe area.
4. A practical default is roughly 20% padding from the square edges.

### Monochrome Icon

1. Use a transparent background.
2. Use a single-color glyph only.
3. Do not rely on multiple colors, gradients, or subtle strokes.
4. Avoid thin outline-only art unless it remains legible after launcher tinting.
5. If interior detail is required, prefer punched-out transparency instead of a second visible color.
6. When a very minimal themed icon is desired, it is acceptable to shrink the glyph dramatically, such as occupying only the center third of the canvas.

## Detail Level

1. Favor bold silhouettes over intricate detail.
2. Avoid text and wordmarks unless the letterform is the brand.
3. Avoid edge-dependent designs that break when clipped by a circular mask.
4. Use strong negative space intentionally; it survives small sizes better than fine ornament.

## PNG Guidance

1. A single `512x512` PNG is a good high-resolution mobile launcher asset.
2. Downscaling from `512x512` is generally fine for launcher use.
3. When rasterizing monochrome assets, preserve alpha explicitly, for example with `PNG32` output.
4. If using a rasterization pipeline that struggles with SVG masking, prefer a simpler source asset and convert a helper color to transparency during rasterization.

## Manifest Guidance

Use distinct icon entries rather than combining everything into one asset whenever practical.

Example purposes:

1. `"purpose": "any"`
2. `"purpose": "maskable"`
3. `"purpose": "monochrome"`

Do not assume platforms will always use the monochrome asset. Treat it as a supported hint, not a guaranteed output.

## Testing Guidance

1. Test on an actual Android device or launcher when launcher appearance matters.
2. Expect different launchers to apply different masks and themed treatments.
3. A browser or file preview may show transparency over black; that does not mean the asset is wrong.
4. Publish and inspect the installed result before concluding that an icon is correct or incorrect.

## Cache And Refresh Guidance

1. Icon updates may be cached aggressively by browsers, service workers, and mobile launchers.
2. Version manifest and icon URLs when changing install assets.
3. Bump the service worker cache name or cached asset list when icon URLs change.
4. If a device keeps stale install metadata, reopening the site, clearing site data, or uninstalling and reinstalling the PWA may still be necessary.

## Decision Summary

1. Use a fuller icon for web surfaces.
2. Use a padded background-backed icon for maskable launcher surfaces.
3. Use a transparent single-color glyph for monochrome themed launcher surfaces.
4. Prefer simple, high-contrast motifs that survive masking, tinting, and small sizes.

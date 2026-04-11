# Pocket Apps Project Guide

Use this when working anywhere in this repo.

## Project Shape

- This repo contains standalone web apps under `docs/`.
- Each app lives in `docs/<NAME>/` and is plain HTML, CSS, and JavaScript.
- There is no npm, no bundler, and no build pipeline.
- Apps are meant to be served or opened as static files and may be installable PWAs.
- Shared browser libraries are loaded with script tags rather than a package manager.

## App Layout

- `docs/<NAME>/`: app assets and source files.
- `docs/<NAME>/icons/`: app icon assets.
- `docs/<NAME>/index.html`: app entrypoint.
- `docs/<NAME>/index.css`: app styles.
- `docs/<NAME>/index.js`: app bootstrap code.
- `docs/<NAME>/app.js`: app logic following the repo's MVVM structure.
- `docs/<NAME>/app.test.js`: app test file.
- `docs/index.html`: top-level entry page with links to all apps.

## Build And Run

- There is no build step.
- Prefer editing source files directly in `docs/<NAME>/`.
- Run apps by opening the relevant HTML file, or use a simple static server if browser security rules matter.
- Example app entrypoint: `docs/<NAME>/index.html`.

## JavaScript Type Checking

- Prefer `// @ts-check` in JavaScript files that contain meaningful logic.
- Use JSDoc for shared data shapes and for method return types when inference is unclear.
- Prefer inline JSDoc object return shapes for one-off derived values.
- When strict checking complains, fix root causes with explicit narrowing and typed records instead of weakening checks.

## Test Commands

- All app tests use the same ESM command shape:

```bash
node --experimental-default-type=module docs/<NAME>/app.test.js
```

## Testing Notes

- App tests are ES modules and should run with `--experimental-default-type=module` in this repo's current setup.
- When adding tests, keep them self-contained and avoid introducing npm-only tooling unless the repo is explicitly being restructured.

## PWA Notes

- If changing manifest, icons, or install metadata, also update service worker cache versioning and any versioned manifest/icon URLs.
- Otherwise browsers can keep stale PWA metadata across reinstalls.

## Working Style

- Keep apps lightweight and dependency-free unless there is a clear payoff.
- Favor plain objects and small functions over framework-heavy patterns.
- Structure app logic using MVVM.
- Keep domain logic in the model, presentation state in the viewmodel, and DOM wiring in the view layer.

---
name: mvvm
description: "Use when structuring or refactoring Alpine app logic around model/viewmodel boundaries, persisted state ownership, business logic placement, watchers, or testable domain logic."
---

# Alpine MVVM Style

Use this guidance when building new Alpine apps in this repo.

## Goal

Structure Alpine apps with a practical MVVM architecture that improves clarity and testability without adding unnecessary abstraction.

The default shape should be:
- View: HTML and CSS only.
- Model: persisted application state plus non-trivial business logic and derived domain data.
- ViewModel: the Alpine-bound object that adapts the model to the view, holds ephemeral UI state, and manages imperative browser/UI side effects.

Keep the architecture simple and pragmatic. Do not introduce event systems, class-heavy patterns, or framework-like ceremony unless the app genuinely needs them.

## View

The view is the HTML and CSS.

Rules:
- Keep the template focused on binding and event wiring.
- Prefer calling named viewmodel methods from the template instead of mutating state inline.
- Do not place meaningful business logic in the template.
- Keep presentation concerns in the view and viewmodel, not in the model.

## Model

The model owns the application's persisted state and all non-trivial domain logic.

The model should usually contain:
- Durable app data such as entries, goals, templates, records, or similar saved state.
- Persisted user preferences when they are part of the saved app state. This includes presentation preferences such as theme mode, unit selection, zoom level, history view, and similar saved settings.
- CRUD operations for persisted data.
- Derived domain data that should be testable, such as aggregations, history buckets, trend summaries, interpolation, forecasting, filtering rules, validation, normalization, and other business calculations.

Model guidelines:
- Prefer plain JavaScript objects and helper functions over classes unless a class is clearly justified.
- Expose model state via direct properties and methods on the model object.
- Let Alpine own the reactive model object directly.
- Avoid hiding authoritative state behind private closure state plus getState() when the viewmodel needs reactive access to model properties.
- Keep model outputs structured and testable.
- If correctness matters, the logic belongs in the model.

### JSDoc In Models

When using `// @ts-check` in model files:
- Define shared persisted data shapes near the top with typedefs. Good candidates are app state objects, entry records, and small string unions.
- Prefer inline JSDoc on returned object methods instead of maintaining one large typedef for the whole model API.
- Follow the feather-weight pattern: annotate method params and return values directly above each method in `createApp()`, and let TypeScript infer the overall object shape.
- Use structural param annotations for private helpers when they only need part of the model shape. Example: `@param {{ entries: Entry[] }} model` instead of introducing a wider typedef just for one helper.
- Prefer inline object return shapes for one-off derived values when a dedicated typedef would only be used once.
- Add explicit annotations when inference becomes unclear or when a nullable return type matters to callers.
- Keep annotations close to the logic they describe. If a typedef exists only to repeat method signatures for one object literal, remove it and inline the docs.

## ViewModel

The viewmodel is the Alpine x-data object.

The viewmodel should usually contain:
- Ephemeral UI state such as open panels, overlays, draft values, selection state, expanded sections, scroll state, transient flags, and similar UI-only concerns.
- Lightweight formatting helpers for UI-facing strings and labels.
- Named commands that the view calls.
- Imperative browser behavior such as scroll coordination, resize handling, focus management, theme application to the document, and other DOM-side effects.
- Cached presentation artifacts when they are expensive to recompute and purely presentational, such as chart render caches, SVG markup, HTML fragments, or other render-ready structures.

Viewmodel guidelines:
- Keep it thin.
- Move logic out of the template into the viewmodel when that improves readability.
- If meaningful logic accumulates in the viewmodel, move it into the model.
- If a piece of state exists only to drive the interface and is not part of persisted correctness, it belongs in the viewmodel.

## Reactivity

Use Alpine reactivity as the default mechanism for model-to-viewmodel and viewmodel-to-view updates.

Guidelines:
- Alpine v3 generally handles direct nested mutation and array mutation reactively.
- Keep a consistent state update style inside model methods.
- Do not move the true source of state into hidden closure variables that Alpine cannot observe.
- Be careful with destructuring or copying values out of reactive objects in ways that break dependency tracking.
- Assume getters are not memoized. If something expensive is accessed repeatedly and is purely presentational, cache it in the viewmodel.

## Watchers

Use $watch for side effects and imperative coordination only.

Good uses for $watch:
- Persistence
- Theme application to the document
- Cached render refreshes
- Scroll or layout adjustments
- Other browser interactions that should happen after reactive state changes

Do not build a custom property-changed or event system unless the app truly needs it.

## Testing

Focus testing effort on the model.

Testing guidance:
- Add or update tests for the model only by default.
- Test data integrity, domain rules, derived values, CRUD operations, normalization, and backward compatibility.
- Do not spend effort testing a thin viewmodel.

## Practical Rules

Use these defaults when deciding where code belongs:
- Persisted data belongs in the model.
- Persisted preferences belong in the model.
- Business rules belong in the model.
- Test-worthy derived data belongs in the model.
- UI-only ephemeral state belongs in the viewmodel.
- Formatting helpers usually belong in the viewmodel.
- Expensive presentation caches belong in the viewmodel.
- Template expressions should stay simple.

If a specific piece of logic seems borderline:
- Put it in the model if correctness matters.
- Put it in the viewmodel if it is purely presentational or a UI-only cache.

## Expected Outcome

New Alpine apps in this repo should start with:
- A clear model module or object with state, methods, and derived domain data.
- A thin Alpine viewmodel that binds the model to the template and owns transient UI state.
- A view layer that stays focused on presentation and bindings.
- Model-focused tests for the extracted domain logic.

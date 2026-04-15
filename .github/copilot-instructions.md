# Copilot Instructions for PocketApps

## Ad Hoc Repo Skills

The markdown files in `skills/` are lightweight, ad hoc repo skills. They are not a full skill-package convention. Treat them as on-demand guidance files that should be read only when the current task overlaps their topic.

Do not load every file in `skills/` by default. Read only the relevant file or files before making changes.

Use these selection rules:

- `skills/project.md`: load for repo-wide context, app layout, test commands, or static-site and PWA constraints.
- `skills/alpine.md`: load when working with Alpine directives, Alpine component structure, or Alpine-specific patterns in markup.
- `skills/mvvm.md`: load when changing app architecture, state ownership, model/viewmodel boundaries, or Alpine app logic.
- `skills/frontend-design.md`: load when building or restyling UI, screens, layouts, or visual design.
- `skills/icon-guidance.md`: load when changing app icons, manifest icon entries, maskable icons, or monochrome/themed icons.

Prefer the smallest relevant set. In most tasks, that means `skills/project.md` plus at most one or two additional files.

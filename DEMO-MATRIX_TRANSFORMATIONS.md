# Demo: Matrix Transformations

This document describes the matrix transformations frontend in
`demos/linalg-matrix_transforms/frontend/`.

## Overview

Current scope is a lightweight shell demo that:

- mounts shared base-shell UI
- renders schema-driven layout panels (`controls`, `output`)
- exposes a button-driven `GET /health` call for backend connectivity checks

The module also exports matrix API bindings for future expansion
(`matrixApply`, `eigen`), though they are not currently used in `main.ts`.

## Demo Structure

```text
demos/linalg-matrix_transforms/frontend/
  src/main.ts
  src/layout-options.ts
  src/lib/api.ts
  src/style.css
```

## Entrypoints

- Browser entrypoint: `src/main.ts`
- Layout profile selection: `src/layout-options.ts`
- API binding surface: `src/lib/api.ts`

## Key Parameters / Constants / Env Vars

- `MATRIX_LAYOUT_MODE` (`src/layout-options.ts`): active variant id
  (`stackedVertical` currently).
- `LAYOUT_SCHEMA_VERSION` (shared): schema compatibility contract.
- `VITE_API_BASE_URL`: optional API base override.
- Fallback API base behavior is shared via `@shared/lib/api`.

## Key Objects / State

No reducer/store is used currently.

Long-lived runtime objects:

- mounted root element (`#app`)
- generated layout root (`#matrix-layout-root`)
- output `<pre>` node for health response
- button handler state is implicit in DOM events

## Key Modules And Responsibilities

- `src/main.ts`
  - shell markup
  - shared layout plan rendering
  - health endpoint button interaction and output rendering
- `src/layout-options.ts`
  - panel schema, variants, fallback profile, warning emission
- `src/lib/api.ts`
  - shared API binding exports for health/matrix/eigen operations
- `src/style.css`
  - matrix-demo-specific layout and panel styling

## Key Functions And Methods

- `renderLayoutPlan(...)` (shared callsite in `src/main.ts`):
  mounts schema panel tree.
- `applyLayoutTokens(...)` (shared callsite in `src/main.ts`):
  applies resolved CSS token overrides.
- `health()` (`src/lib/api.ts`): typed backend health request.

Local helper utilities in `src/main.ts`:

- `createTemplateElement<T>(markup)`
- `requireElement<T>(root, selector)`

## Theme And Style Tokens

Token sources:

- `@shared/ui/base-shell.css` (imports shared token/primitives system)
- `src/style.css` (demo-specific layout overrides)

This demo primarily consumes shared `--base-*` tokens and base-shell aliases,
with no dedicated per-demo token map like vectors.

## Data And API Contracts

### Currently used by UI

- `GET /health`
  - success renders prettified JSON payload in output panel
  - error path renders `Error: <message>`

### Exported and available for future UI flows

- `POST /api/v1/matrix/apply`
- `POST /api/v1/matrix/eig`

These are exposed by `src/lib/api.ts` but not currently called in `src/main.ts`.

## Layout Contract (Demo-Specific)

Panel IDs:

- `controls`
- `output`

Variants:

- `sideBySide`
- `stackedVertical` (current)

Both variants currently preserve `controls -> output` order.

# Layout System Guide

`LAYOUT.md` at the repo root is the canonical documentation for the shared
schema-driven layout system used across demos.

## Scope

This document covers:

- shared layout schema and validation contracts
- runtime profile resolution and fallback behavior
- recursive layout renderer contract
- per-demo layout options and panel trees
- CSS token application for layout variants

## Shared Layout Modules

- `demos/shared/src/lib/layout-schema.ts`
  - schema types (`LayoutSchema`, `LayoutPanelDef`, `LayoutVariant`,
    `LayoutPlacement`)
- `demos/shared/src/lib/layout-validate.ts`
  - structural validation and diagnostics
- `demos/shared/src/lib/layout-plan.ts`
  - recursive plan node types and flatten helper
- `demos/shared/src/lib/layout-runtime.ts`
  - schema resolution, fallback profile creation, token normalization,
    placement style generation
- `demos/shared/src/lib/layout-renderer.ts`
  - recursive DOM renderer using demo-provided panel renderers

## Architecture Flow

1. `validateLayoutSchema(schema)` validates structure and cross-references.
2. `resolveLayoutProfile(...)` picks requested or default variant.
3. Placement order and token values are normalized.
4. Recursive render plan is assembled from `parentId` relationships.
5. `renderLayoutPlan(...)` mounts the tree using panel renderers.

The pipeline is deterministic and can fallback to a static variant profile when
schema validation fails.

## Schema Contract

### `LayoutSchema`

- `schemaVersion`: must match `LAYOUT_SCHEMA_VERSION`
- `defaultVariantId`: fallback variant id when requested variant is missing
- `panels`: panel definitions with optional `parentId`
- `variants`: placement/token definitions for each layout mode

### `LayoutPanelDef`

- `id`: unique panel id
- `parentId?`: optional parent panel id for recursive composition

### `LayoutVariant`

- `id`: mode id (`sideBySide`, `stackedVertical`, or custom)
- `containerClassName`: CSS class applied to layout root
- `placements`: per-panel layout constraints
- `tokens?`: per-variant token overrides (string/number values)

### `LayoutPlacement`

- `panelId`
- `order?` (defaults to declaration order)
- optional placement constraints:
  - `width`, `height`
  - `minWidth`, `minHeight`
  - `maxWidth`, `maxHeight`
  - `padding`

## Validation Rules

`layout-validate.ts` enforces:

- schema version compatibility
- unique panel ids
- valid parent references
- no self-parent references
- no parent cycles
- unique variant ids
- non-empty `containerClassName`
- unique placement per panel per variant
- full placement coverage for every panel in each variant
- valid `defaultVariantId`

Validation issues are returned with path-based diagnostics.

## Runtime Profile Contract

`resolveLayoutProfile(...)` returns:

- `variantId`
- `containerModeClassName`
- `tokens`
- `warnings`
- `isFallback`
- `renderPlan`
- `placementOf(panelId)`
- `nodeOf(panelId)`

Helper utilities:

- `applyLayoutTokens(root, tokens)`
- `placementToInlineStyle(placement)`
- `logLayoutWarnings(context, warnings)`

## Recursive Renderer Contract

`renderLayoutPlan({ container, plan, registry, shouldRenderPanel })`:

- clears and mounts a recursive plan into `container`
- returns `Map<panelId, HTMLElement>` for post-mount binding
- requires a renderer for each rendered panel (throws if missing)

Renderer output may be:

- `HTMLElement`
- `{ element, childContainer? }` for parent panels with explicit child mount
  zones

Registry options:

- `byPanelId`
- `byKey` + `rendererKeyOf`

## Demo Layout Options

### Vectors

- File: `demos/linalg-vectors/frontend/src/app/layout-options.ts`
- Mode constant: `VECTORS_LAYOUT_MODE` (`stackedVertical` currently)
- Optional panel toggle: `INCLUDE_DEBUG_PANEL`
- Panel tree:
  - roots: `grid`, `vector`, `debug`
  - children of `vector`: `selected`, `vectorWindow`
  - children of `vectorWindow`: `slider`, `components`
- Container classes:
  - `layout--side-by-side`
  - `layout--stacked-vertical`

### Matrix Transformations

- File: `demos/linalg-matrix_transforms/frontend/src/layout-options.ts`
- Mode constant: `MATRIX_LAYOUT_MODE` (`stackedVertical` currently)
- Panel tree:
  - roots: `controls`, `output`
- Container classes:
  - `base-layout--side-by-side`
  - `base-layout--stacked-vertical`

### Markov Chains

- File: `demos/linalg-markov_chains/frontend/src/layout-options.ts`
- Mode constant: `MARKOV_LAYOUT_MODE` (`sideBySide` currently)
- Panel tree:
  - roots: `top`, `matrix`
  - children of `top`: `graph`, `state`
- Container classes:
  - `markov-layout--side-by-side`
  - `markov-layout--stacked-vertical`

### Networks

- File: `demos/linalg-networks/frontend/src/layout-options.ts`
- Mode constant: `NETWORKS_LAYOUT_MODE` (`sideBySide` currently)
- Panel tree:
  - roots: `top`, `bottom`
  - children of `top`: `graph`, `flow`
  - children of `bottom`: `matrix`, `spaces`
- Container classes:
  - `networks-layout--side-by-side`
  - `networks-layout--stacked-vertical`

## Fallback Behavior

If schema validation fails or requested/default variants cannot be resolved,
`resolveLayoutProfile(...)` builds a fallback profile using explicit
`panelOrder` and `containerClassName` from demo fallback definitions.

Fallback profile characteristics:

- deterministic ordering
- no schema-dependent parent hierarchy
- warning emission via `logLayoutWarnings(...)`

## Token Application Model

Variant `tokens` are normalized to strings and applied to the chosen root via
`applyLayoutTokens(...)`.

This supports:

- mode-specific spacing/geometry tweaks
- compatibility with existing CSS variable strategies
- cross-demo consistency through shared base tokens

## Current Migration Notes

Vectors still includes `USE_RECURSIVE_LAYOUT_ENGINE` in
`demos/linalg-vectors/frontend/src/app/view.ts` for legacy-template parity
checks.

When `false`, vectors can render a legacy flat template path for comparison.

## Change Checklist For Layout Work

When changing layout schema/runtime/renderer contracts:

1. Update this `LAYOUT.md`.
2. Update `CODEMAP.md` if shared contracts, constants, or module ownership
   changed.
3. Update affected `DEMO-*.md` docs for demo-specific schema and panel tree
   changes.
4. If runtime behavior changed, validate affected demo build(s).

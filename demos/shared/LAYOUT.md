# Shared Layout Guide

This guide documents the schema-driven layout system used by demos in this
repository, including recursive panel composition and renderer registration.

## Shared modules

- `demos/shared/src/lib/layout-schema.ts`
  - Schema contract and types.
- `demos/shared/src/lib/layout-validate.ts`
  - Runtime schema validation.
- `demos/shared/src/lib/layout-plan.ts`
  - Render-plan node types and tree helpers.
- `demos/shared/src/lib/layout-runtime.ts`
  - Variant resolution, fallback behavior, token normalization, plan assembly.
- `demos/shared/src/lib/layout-renderer.ts`
  - Recursive DOM renderer using demo-supplied render strategies.

## Architecture flow

The layout pipeline is functional and deterministic:

1. `validateLayoutSchema(schema)`
2. resolve requested variant (`variantId` -> default -> fallback)
3. normalize placement order and tokens
4. assemble recursive render plan from `parentId`
5. render plan recursively using a renderer registry

Schema defines structure and placement. Demos define visual/behavioral panel
content through renderers.

## Schema contract

## `LayoutSchema`

- `schemaVersion`: must match `LAYOUT_SCHEMA_VERSION`.
- `defaultVariantId`: variant used when requested variant is missing.
- `panels`: panel definitions (id and optional parent).
- `variants`: placement/token definitions per mode.

## `LayoutPanelDef`

- `id`: unique panel id.
- `parentId`: optional parent panel id for recursive composition.

Parenthood does not imply a purely structural wrapper. Parent panels can still
use full renderers with visual/behavioral features.

## `LayoutVariant`

- `id`: variant id (`sideBySide`, `stackedVertical`, or custom).
- `containerClassName`: class for outer layout container.
- `placements`: per-panel placement settings.
- `tokens`: optional CSS token overrides for the variant.

## `LayoutPlacement`

- `panelId`
- `order` (optional, defaults to declaration order)
- `width`, `height`
- `minWidth`, `minHeight`
- `maxWidth`, `maxHeight`
- `padding`

Each variant must provide placement coverage for every panel id.

## Validation rules

`layout-validate.ts` enforces:

- schema version match
- unique panel ids and variant ids
- valid parent references
- no self-parent references
- no parent cycles
- non-empty `containerClassName`
- unique placement per panel per variant
- full placement coverage across all panels
- valid `defaultVariantId`

Errors are returned with path-based diagnostics for fast debugging.

## Runtime profile

`resolveLayoutProfile(...)` returns:

- `containerModeClassName`
- `tokens`
- `warnings`
- `isFallback`
- `placementOf(panelId)`
- `nodeOf(panelId)`
- `renderPlan` (recursive plan used by renderer)

`placementToInlineStyle(...)` and `applyLayoutTokens(...)` are retained for
compatibility with existing demos.

## Render plan and recursive renderer

`layout-plan.ts` defines:

- `LayoutPlanNode`: `panelId`, `order`, `inlineStyle`, `children`
- `LayoutRenderPlan`: variant metadata + root nodes

`layout-renderer.ts` provides:

- `renderLayoutPlan({ container, plan, registry, shouldRenderPanel })`
- returns `Map<panelId, HTMLElement>` for post-render lookup/event binding

Renderer contract:

- Every rendered panel requires a renderer (fail-fast if missing).
- Renderer output can be:
  - `HTMLElement`
  - `{ element, childContainer }` for parent panels with explicit child mount zone
- `shouldRenderPanel` can hide optional panels (for example debug panels).

Registry supports reusable renderer strategies:

- `byPanelId` for direct panel mapping
- `byKey` + `rendererKeyOf` for shared renderer reuse across panel ids

## Vectors demo usage

Vectors layout schema (`demos/linalg-vectors/frontend/src/app/layout-options.ts`)
defines nested panels:

- roots: `grid`, `vector`, `debug`
- children of `vector`: `selected`, `vectorWindow`
- children of `vectorWindow`: `slider`, `components`

`view.ts`:

1. builds shell (hero + empty layout root)
2. calls `renderLayoutPlan(...)` with vectors renderer registry
3. conditionally filters `debug` with `INCLUDE_DEBUG_PANEL`
4. queries mounted ids/classes for existing app render flow

The existing state/reducer/render modules continue to render:

- image/document table (`grid`)
- selected image/text (`selected`)
- vector range/slider/list (`vectorWindow`, `slider`, `components`)

## Matrix demo usage

Matrix demo uses the same shared recursive renderer for `controls` and `output`
panels in `demos/linalg-matrix_transforms/frontend/src/main.ts`.

This keeps layout assembly consistent across demos while allowing each demo to
define content independently.

## Migration toggle

Vectors view includes an internal compatibility toggle:

- `USE_RECURSIVE_LAYOUT_ENGINE = true`

Set to `false` to render the legacy flat template path during migration parity
checks.

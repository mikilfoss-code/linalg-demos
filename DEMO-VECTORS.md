# Demo: Vectors

This document describes the vectors frontend in
`demos/linalg-vectors/frontend/`.

## Overview

Purpose:

- sample image/text datasets from backend
- render a selectable sample grid
- render a selected sample (canvas or text)
- render a sliding window over vector components
- support text-token to vector-row highlight linking

## Demo Structure

```text
demos/linalg-vectors/frontend/
  src/main.ts
  src/theme.css
  src/style.css
  src/app/
    bootstrap.ts
    state.ts
    events.ts
    layout*.ts
    render-*.ts
    sampling.ts
    text-highlighting.ts
    view.ts
  src/lib/
    api.ts
    dataset.ts
    types.ts
```

## Entrypoints

- Browser entrypoint: `src/main.ts`
- App shell construction: `src/app/view.ts::createAppView`
- Startup sequence: `src/app/bootstrap.ts::initializeVectorsApp`
- Build/dev scripts (package):
  - `pnpm dev`
  - `pnpm build`
  - `pnpm preview`

## Key Parameters / Constants / Env Vars

### Constants

- `VECTOR_WINDOW` (`src/app/constants.ts`): visible vector rows per window
  (currently `10`).
- `DEFAULT_DATASET` (`src/app/constants.ts`): initial dataset (`mnist`).
- `DEFAULT_IMAGE_WIDTH`, `DEFAULT_IMAGE_HEIGHT`: image fallback geometry.
- `VECTORS_LAYOUT_MODE` (`src/app/layout-options.ts`): active layout variant.
- `INCLUDE_DEBUG_PANEL` (`src/app/layout-options.ts`): optional debug panel.
- `USE_RECURSIVE_LAYOUT_ENGINE` (`src/app/view.ts`): recursive renderer toggle.

### CSS Runtime/Config Inputs

- Grid sizing and limits are read from CSS custom properties in
  `src/theme.css` by `src/app/layout-config.ts`.
- Effective sample target count is derived from measured layout and capped by
  `--grid-max-samples`.

### Environment

- `VITE_API_BASE_URL`: optional backend base URL override.
- Fallback behavior comes from shared `getApiBaseUrl()`.

## Key Objects / State

Primary browser-lifetime state in `src/main.ts`:

- `state: AppState`
  - `status`, `dataset`, `datasetOptions`
  - `meta`, `samples`, `selectedId`
  - `vectorOffset`
  - `gridLayout`, `targetSampleCount`
  - optional `error`
- Interaction-local state:
  - `imageHoverPixelIndex`
  - `imagePinnedPixelIndex`
  - `lastSamples`, `lastModality`

Supporting long-lived objects:

- `sampling` controller (`createSamplingController`)
- `selectedRenderer` (`createSelectedRenderer`)
- `vectorRenderer` (`createVectorRenderer`)
- `textHighlighting` controller (`createTextHighlightingController`)

## Key Modules And Responsibilities

- `src/main.ts`
  - composition root, reducer dispatch, main render orchestration
- `src/app/state.ts`
  - reducer and domain helpers for selection/modality/offset
- `src/app/sampling.ts`
  - cancellation-aware replace/append/trim sample workflow
- `src/app/events.ts`
  - DOM event binding for grid, slider, wheel, text, and canvas interactions
- `src/app/layout.ts` + `src/app/layout-config.ts`
  - responsive grid math and token-derived layout parameters
- `src/app/view.ts`
  - app shell markup and shared recursive layout renderer integration
- `src/lib/api.ts`
  - runtime validation for dataset API payloads
- `src/lib/dataset.ts`
  - API payload normalization to strongly typed sample unions

## Key Functions And Methods

- `dispatch(action)` (`src/main.ts`): reducer transition + rerender.
- `updateLayoutFromGridSize(width, height, options?)` (`src/main.ts`):
  modality-aware layout recomputation.
- `render(current)` (`src/main.ts`): top-level DOM reconciliation.
- `reducer(current, action)` (`src/app/state.ts`): canonical state machine.
- `createSamplingController(...)` (`src/app/sampling.ts`): async sample control.
- `attachAppEventHandlers(...)` (`src/app/events.ts`): centralized UI binding.
- `createAppView(...)` (`src/app/view.ts`): layout-mount + DOM refs.
- `listDatasets()` and `datasetSamples(...)` (`src/lib/api.ts`):
  typed backend requests with validation.
- `loadDatasetSamples(...)` (`src/lib/dataset.ts`): normalized data fetch path.

## Theme And Style Tokens

Primary sources:

- `src/theme.css`: vectors-specific token aliases and geometry settings.
- `src/style.css`: layout and component styling that consumes tokens.
- `demos/shared/src/ui/tokens.css`: shared base token values.
- `demos/shared/src/ui/primitives.css`: shared panel/button primitives.

Token groups used extensively:

- typography/spacing: `--font-*`, `--space-*`
- color/surface/effects: `--ink`, `--paper`, `--accent`, `--shadow-*`
- grid geometry: `--grid-*`, `--text-grid-columns`, `--text-tile-min-height`
- selected card/vector panel geometry: `--selected-*`, `--vector-*`
- runtime variables set by TS:
  - `--grid-columns`, `--grid-rows`, `--grid-row-size`
  - `--tile-aspect-ratio`, `--selected-canvas-aspect`
  - `--vector-text-word-width-dynamic`

## Data And API Contracts

Endpoints consumed for core UX:

- `GET /api/v1/datasets`
- `GET /api/v1/datasets/samples`

Payload expectations:

- Catalog includes `defaultDataset` and dataset descriptors.
- Samples include modality metadata and `samples[]`.
- Image sample rows include flattened grayscale `pixels`.
- Text sample rows include `rawText`, `snippet`, `wordCounts[]`, and top-level
  `vocab`.

Additional exported API bindings (not central to current vectors UX flow):

- `health`
- `matrixApply`
- `eigen`

## Layout Contract (Demo-Specific)

Panel IDs in vectors layout schema:

- roots: `grid`, `vector`, `debug`
- children:
  - `selected`, `vectorWindow` under `vector`
  - `slider`, `components` under `vectorWindow`

Variants:

- `sideBySide`
- `stackedVertical` (current default via `VECTORS_LAYOUT_MODE`)

Fallback profile is generated with `resolveLayoutProfile(...)` and warning logs
are emitted via `logLayoutWarnings(...)`.

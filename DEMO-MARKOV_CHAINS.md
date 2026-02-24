# Demo: Markov Chains

This document describes the Markov chains frontend in
`demos/linalg-markov_chains/frontend/`.

## Overview

Purpose:

- interactive transition-matrix editor
- synchronized graph + state-vector + matrix panels
- deterministic stepping and auto-step animation loop
- in-graph edge/node editing and cross-panel highlighting
- flow-particle visualization of state transitions
- dataset mode for SNAP web-Google extraction presets (~200-node instructional subgraphs)

Current implementation is primarily client-side simulation, with optional
dataset-mode calls to backend extraction endpoints.

## Demo Structure

```text
demos/linalg-markov_chains/frontend/
  src/main.ts
  src/layout-options.ts
  src/style.css
  src/app/
    types.ts
    actions.ts
    panel-context.ts
    selectors.ts
    edit-session.ts
    edit-value-input.ts
    dom-helpers.ts
    panel-shared.ts
    reducer.ts
    store.ts
    render-graph.ts
    render-state-panel.ts
    render-matrix-panel.ts
    step-runtime.ts
    step-runtime-messages.ts
    workers/
      markov-step.worker.ts
    graph-*.ts
    node-label.ts
  src/lib/
    markov.ts
    markov-sparse.ts
    markov-sparse-self-check.ts
    transition-graph-generator.ts
    dataset-api.ts
```

## Entrypoints

- Browser entrypoint: `src/main.ts`
- State initialization: `src/app/reducer.ts::createInitialState`
- App store creation: `src/app/store.ts::createStore`
- Layout profile selection: `src/layout-options.ts`

## Key Parameters / Constants / Env Vars

### Constants

- `MARKOV_LAYOUT_MODE` (`src/layout-options.ts`): active layout variant
  (currently `sideBySide`).
- `MIN_NODE_COUNT`, `MAX_NODE_COUNT`, `DEFAULT_NODE_COUNT`
  (`src/lib/markov.ts`): node bounds/default.
- `DEFAULT_TRANSITION_GRAPH_STRATEGY_ID`
  (`src/lib/transition-graph-generator.ts`): default generator strategy.
- `AUTO_STEP_TICK_MS` (`src/main.ts`): interval cadence for auto-step loop
  (currently `90` ms).

### Environment

- `VITE_API_BASE_URL` is displayed in UI via shared API base resolver but no
  backend Markov calls are currently made.

## Key Objects / State

Primary browser-lifetime object:

- `store` created from reducer with `AppState`:
  - `nodeCount`
  - `transitionMatrix`
  - `initialVector`
  - `currentVector`
  - `stepCount`
  - `sourceMode`
  - `dataset` (selected preset/layout/target/seed + extraction status)
  - `validation`
  - `editSession`
  - `flowAnimation`
  - `nextAnimationId`
  - `hasPendingMatrixEdits`
  - `stepCompute` (worker-backed step lifecycle + timing telemetry)

Additional long-lived runtime objects in `src/main.ts`:

- `graphPanel` controller
- `statePanel` controller
- `matrixPanel` controller
- `transitionGraphGenerator`
- auto-step interval and running flag

## Key Modules And Responsibilities

- `src/main.ts`
  - composition root, panel controller wiring, auto-step loop, global listeners
- `src/app/reducer.ts`
  - canonical state transitions for all edit/normalize/step/reset actions
- `src/app/actions.ts`
  - action union contract for store dispatch
- `src/app/store.ts`
  - small observable store abstraction
- `src/app/selectors.ts`
  - shared "displayed value" selectors for committed vs draft edit values
- `src/app/edit-value-input.ts`
  - shared input sanitization/parsing and overwrite-mode keyboard/caret helpers
- `src/app/panel-context.ts`
  - scope + highlight context shared by matrix/state panel renderers
- `src/app/panel-shared.ts`
  - shared windowing/highlight helpers reused by state and matrix panels
- `src/app/dom-helpers.ts`
  - shared template/query DOM utilities used by panel controllers
- `src/app/render-graph.ts`
  - graph rendering, interactions, inline edits, dataset controls, flow animation
- `src/app/render-state-panel.ts`
  - state vector controls and auto-step controls
- `src/app/render-matrix-panel.ts`
  - matrix editor panel (`P^T` view semantics)
- `src/app/graph-interaction-presenter.ts`
  - hover/focus/selection highlight models
- `src/lib/markov.ts`
  - probability math, validation, flow animation planning
- `src/lib/markov-sparse.ts`
  - sparse CSR build + sparse step multiply (`O(E)` stepping path)
- `src/app/workers/markov-step.worker.ts`
  - worker-side sparse stepping + flow-animation payload generation
- `src/app/step-runtime.ts`
  - main-thread worker orchestration and request lifecycle wiring
- `src/lib/transition-graph-generator.ts`
  - pluggable random graph generation strategies
- `src/lib/dataset-api.ts`
  - typed API wrapper for Markov dataset catalog and extraction endpoints

## Key Functions And Methods

- `createInitialState()` / `reducer(...)` (`src/app/reducer.ts`):
  core state machine.
- `createStore(...)` (`src/app/store.ts`): state container + subscriptions.
- `selectDisplayedTransitionCell(...)` / `selectDisplayedInitialValue(...)`
  (`src/app/selectors.ts`): panel-visible values during edit sessions.
- `createGraphPanelController(...)` (`src/app/render-graph.ts`):
  graph panel runtime orchestration.
- `loadDatasetCatalog()` / `extractDatasetSubgraph()` (`src/main.ts`):
  async dataset-mode API orchestration.
- `readNonNegativeDraftInputValue(...)` (`src/app/edit-value-input.ts`):
  shared parser/sanitizer for matrix/state/graph numeric inputs.
- `buildValidationSummary(...)` (`src/lib/markov.ts`):
  step/validity gate diagnostics.
- `stepVector(...)` (`src/lib/markov.ts`):
  row-vector Markov update.
- `stepVectorSparse(...)` (`src/lib/markov-sparse.ts`):
  sparse row-vector update used by worker runtime.
- `createFlowAnimation(...)` (`src/lib/markov.ts`):
  transition particles and timing plan.
- `createTransitionGraphGenerator(...)` (`src/lib/transition-graph-generator.ts`):
  strategy registry and generation API.

## Step Runtime (Option 2)

- UI `STEP` actions are intercepted in `src/main.ts` and computed asynchronously via
  `src/app/step-runtime.ts`.
- The worker caches normalized transition matrices and computes sparse steps using CSR in
  `src/app/workers/markov-step.worker.ts` + `src/lib/markov-sparse.ts`.
- Animation quality is preserved because flow payloads are still generated with the same
  `createFlowAnimation(...)` logic/parameters (now executed in worker).
- The header debug pill (`#markov-step-runtime-pill`) reports request lifecycle and compute latency.
- Dev-mode parity/performance self-check runs once at startup via
  `src/lib/markov-sparse-self-check.ts`.

## Theme And Style Tokens

Token sources:

- `@shared/ui/base-shell.css`
- `src/style.css`

Notable markov-specific overrides:

- `--ui-button-bg`
- `--ui-button-fg`
- `--ui-button-focus-ring`
- `--ui-button-hover-shadow`

The rest of the styling relies heavily on shared `--base-*` tokens plus
markov-specific class-level styling for graph, matrix, and control elements.

## Data And API Contracts

### Current runtime API usage

- `GET /api/v1/markov/datasets` for dataset + preset catalog metadata.
- `POST /api/v1/markov/datasets/{datasetId}/extract` for extracted subgraph payloads.
- Manual/random simulation remains local (no required backend calls).

### Related backend contract (not currently invoked by this UI)

- `POST /api/v1/markov/analyze` supports:
  - `transitionMatrix`, `initialVector`, `currentVector`
  - response diagnostics (`nextVector`, `stationaryDistribution`,
    `spectralGap`, etc.)

## Layout Contract (Demo-Specific)

Panel IDs:

- roots: `top`, `matrix`
- children of `top`: `graph`, `state`

Variants:

- `sideBySide` (current)
- `stackedVertical`

Both variants keep shared top-row composition (`graph` + `state`) via `top`
parent panel and place matrix panel as the second root panel.

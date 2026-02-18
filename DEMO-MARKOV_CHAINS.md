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

Current implementation is client-side simulation; it does not call
`POST /api/v1/markov/analyze` at runtime.

## Demo Structure

```text
demos/linalg-markov_chains/frontend/
  src/main.ts
  src/layout-options.ts
  src/style.css
  src/app/
    types.ts
    actions.ts
    reducer.ts
    store.ts
    render-graph.ts
    render-state-panel.ts
    render-matrix-panel.ts
    graph-*.ts
    node-label.ts
  src/lib/
    markov.ts
    transition-graph-generator.ts
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
  - `validation`
  - `flowAnimation`
  - `nextAnimationId`
  - `hasPendingMatrixEdits`

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
- `src/app/render-graph.ts`
  - graph rendering, interactions, inline edits, flow animation
- `src/app/render-state-panel.ts`
  - state vector controls and auto-step controls
- `src/app/render-matrix-panel.ts`
  - matrix editor panel (`P^T` view semantics)
- `src/app/graph-interaction-presenter.ts`
  - hover/focus/selection highlight models
- `src/lib/markov.ts`
  - probability math, validation, flow animation planning
- `src/lib/transition-graph-generator.ts`
  - pluggable random graph generation strategies

## Key Functions And Methods

- `createInitialState()` / `reducer(...)` (`src/app/reducer.ts`):
  core state machine.
- `createStore(...)` (`src/app/store.ts`): state container + subscriptions.
- `createGraphPanelController(...)` (`src/app/render-graph.ts`):
  graph panel runtime orchestration.
- `buildValidationSummary(...)` (`src/lib/markov.ts`):
  step/validity gate diagnostics.
- `stepVector(...)` (`src/lib/markov.ts`):
  row-vector Markov update.
- `createFlowAnimation(...)` (`src/lib/markov.ts`):
  transition particles and timing plan.
- `createTransitionGraphGenerator(...)` (`src/lib/transition-graph-generator.ts`):
  strategy registry and generation API.

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

- No backend endpoint calls for simulation logic.
- UI displays resolved API base URL for reference.

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

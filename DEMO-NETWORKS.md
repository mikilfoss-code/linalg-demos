# Demo: Networks (Incidence Spaces)

This document describes the networks frontend in
`demos/linalg-networks/frontend/`.

## Overview

Purpose:

- build a small directed graph
- edit an edge-flow vector `f`
- compute node imbalance `b = M f`
- inspect incidence matrix `M` and `rref(M)`
- inspect basis vectors for `Row(M)`, `Col(M)`, and `Null(M)`

Conventions:

- incidence matrix rows are nodes and columns are edges
- for edge `u -> v`, `M[u, e] = -1`, `M[v, e] = +1`
- self-loops are disallowed
- parallel directed edges are disallowed

## Demo Structure

```text
demos/linalg-networks/frontend/
  src/main.ts
  src/layout-options.ts
  src/style.css
  src/app/
    actions.ts
    events.ts
    graph-layout.ts
    reducer.ts
    types.ts
    panels/
      graph-panel.ts
      flow-panel.ts
      matrix-panel.ts
      spaces-panel.ts
```

## Entrypoints

- Browser entrypoint: `src/main.ts`
- Layout profile selection: `src/layout-options.ts`
- State initialization: `src/app/reducer.ts::createInitialState`

## Key Parameters / Constants / Env Vars

- `NETWORKS_LAYOUT_MODE` (`src/layout-options.ts`): active layout mode.
- `MAX_NODES` (`src/app/reducer.ts`): max node count (`5`).
- `MAX_EDGES` (`src/app/reducer.ts`): max directed edge count (`12`).

## Key Objects / State

Primary browser-lifetime object:

- shared reducer store (`createStore`) with `NetworksState`:
  - `nodes`, `edges`, `flowVector`
  - edge-draft selection (`edgeDraftFrom`, `edgeDraftTo`)
  - selected basis vector (`selectedBasis`)
  - computed data (`incidenceMatrix`, `imbalanceVector`, `rrefMatrix`, bases)

Additional long-lived runtime objects:

- typed event bus (`createEventBus`) used as command/state mediator
- panel controllers for graph/flow/matrix/spaces panels

## Key Modules And Responsibilities

- `src/main.ts`
  - composition root
  - shared layout mounting
  - command-to-reducer wiring through event bus
- `src/app/reducer.ts`
  - graph edit rules and constraints
  - derived matrix/vector/basis recomputation
- `src/app/panels/graph-panel.ts`
  - graph editor controls and shared graph SVG rendering
  - on-graph flow and imbalance value annotations
- `src/app/panels/flow-panel.ts`
  - editable edge flow column vector and computed imbalance column vector
- `src/app/panels/matrix-panel.ts`
  - incidence matrix and `rref(M)` rendering
- `src/app/panels/spaces-panel.ts`
  - row/column/null basis button groups and selected vector display
- `src/app/events.ts`
  - typed event-bus contract for commands and state fanout
- `@shared/graph/highlight.ts`
  - reusable graph interaction target parsing, sanitization, and highlight derivation
- `@shared/graph/render-svg.ts`
  - reusable directed-graph SVG renderer used by the graph panel
- `@shared/graph/style.ts`
  - reusable graph color/stroke/opacity helpers shared with Markov graph visuals

## Key Functions And Methods

- `reducer(state, action)` (`src/app/reducer.ts`)
  - handles graph and flow edits, applies demo-only edge constraints, and recomputes derived state.
- `selectedBasisVector(state)` (`src/app/reducer.ts`)
  - resolves currently selected basis vector for display.
- `createGraphPanelController(...)` (`src/app/panels/graph-panel.ts`)
  - graph editing controls and SVG edge/node annotation rendering.
- `createFlowPanelController(...)` (`src/app/panels/flow-panel.ts`)
  - edge-flow input handling and imbalance rendering.
- `createMatrixPanelController(...)` (`src/app/panels/matrix-panel.ts`)
  - matrix table rendering for `M` and `rref(M)`.
- `createSpacesPanelController(...)` (`src/app/panels/spaces-panel.ts`)
  - basis selection controls and selected vector column rendering.

Shared math helpers used by this demo:

- `buildDirectedIncidenceMatrix(...)`
- `multiplyMatrixVector(...)`
- `computeRref(...)`
- `rowSpaceBasis(...)`, `columnSpaceBasis(...)`, `nullSpaceBasis(...)`

## Theme And Style Tokens

Token sources:

- `@shared/ui/base-shell.css`
- `@shared/ui/graph-primitives.css`
- `src/style.css`

The demo uses shared base-shell tokens and applies layout-level button token
overrides from `src/layout-options.ts`.

## Data And API Contracts

Runtime backend API usage:

- none required; this demo is fully local/client-side.

Internal command/state contract:

- command events include node/edge/flow edits and basis selection
- state broadcast event emits full `NetworksState` snapshots to panel controllers

## Layout Contract (Demo-Specific)

Panel tree:

- roots: `top`, `bottom`
- children of `top`: `graph`, `flow`
- children of `bottom`: `matrix`, `spaces`

Variants:

- `sideBySide`
- `stackedVertical`

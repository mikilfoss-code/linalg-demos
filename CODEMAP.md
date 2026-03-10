<!-- markdownlint-disable -->

# CODEMAP

## Source Of Truth

- Topic: Global repo structure, shared constants/state/contracts, deployment snapshot. Canonical document: `CODEMAP.md`.
- Topic: Shared schema-driven layout engine and per-demo layout variants/panel trees. Canonical document: `LAYOUT.md`.
- Topic: Project-level usage, run/build workflows, and doc map. Canonical document: `README.md`.
- Topic: Backend architecture, endpoint ownership, invariants, and error policy. Canonical document: `BACKEND.md`.
- Topic: Vectors demo architecture/state/tokens/contracts. Canonical document: `DEMO-VECTORS.md`.
- Topic: Matrix demo architecture/contracts. Canonical document: `DEMO-MATRIX_TRANSFORMATIONS.md`.
- Topic: Markov demo architecture/state/contracts. Canonical document: `DEMO-MARKOV_CHAINS.md`.
- Topic: Networks demo architecture/state/contracts. Canonical document: `DEMO-NETWORKS.md`.

## Cross-System Dependency Summary

- Consumer: `demos/linalg-vectors/frontend`. Depends on: `GET /api/v1/datasets`, `GET /api/v1/datasets/samples`. Notes: Primary data-loading path for vectors UX.
- Consumer: `demos/linalg-matrix_transforms/frontend`. Depends on: `GET /health`. Notes: Button-driven connectivity check in current UX.
- Consumer: `demos/linalg-markov_chains/frontend`. Depends on: `GET /api/v1/markov/datasets`, `POST /api/v1/markov/datasets/{datasetId}/extract`. Notes: Manual/random simulation is local; dataset mode calls backend extraction APIs.
- Consumer: `demos/linalg-networks/frontend`. Depends on: none (local client-side math). Notes: incidence-space exploration is computed fully in-browser.
- Consumer: all demos. Depends on: `demos/shared/src/lib/layout-*`, `demos/shared/src/ui/*`. Notes: Shared layout/runtime/tokens infrastructure.

## Repo Layout (By Location)

### Root
- `package.json` - root pnpm workspace scripts (`build`, `dev:*`, `typecheck`) and Volta Node pin.
- `pnpm-workspace.yaml` - workspace package discovery (`demos/*/frontend`).
- `pnpm-lock.yaml` - single lockfile for frontend workspace packages.
- `.nvmrc` - local Node pin (`25.6.0`).
- `render.yaml` - Render deployment definitions for backend + static demo frontends.
- `.agent/` - local agent rules, workflows, and skills used for this repo.
- `CODEMAP.md` - repository map and architecture summary.
- `LAYOUT.md` - canonical shared layout-system reference.
- `README.md` - project overview and run/build workflow entrypoint.
- `BACKEND.md` - backend-specific architecture and API contract reference.
- `DEMO-VECTORS.md` - vectors demo architecture reference.
- `DEMO-MATRIX_TRANSFORMATIONS.md` - matrix demo architecture reference.
- `DEMO-MARKOV_CHAINS.md` - Markov demo architecture reference.
- `DEMO-NETWORKS.md` - networks demo architecture reference.

### backend/
- `backend/main.py` - FastAPI app entrypoint, middleware wiring, matrix endpoints.
- `backend/datasets.py` - dataset registry, caching, split handling, and sample serialization.
- `backend/requirements.in` - direct runtime dependencies.
- `backend/requirements.txt` - compiled runtime lockfile.
- `backend/requirements-dev.in` - direct dev/test dependencies.

### backend/api/
- `backend/api/routes/datasets.py` - dataset catalog + sampling HTTP routes.
- `backend/api/routes/markov_datasets.py` - Markov dataset catalog/preset/extraction HTTP routes.
- `backend/api/routes/__init__.py` - route package marker.
- `backend/api/__init__.py` - API package marker.

### backend/services/
- `backend/services/dataset_sampling.py` - service layer for dataset route responses and HTTP error mapping.
- `backend/services/markov_dataset_service.py` - HTTP-friendly service wrapper for Markov dataset extraction workflows.
- `backend/services/markov_dataset_extraction.py` - cached web-graph ingestion and preset-based subgraph extraction.
- `backend/services/text_vectorization.py` - 20 Newsgroups tokenizer/filter/vectorizer policy.

### backend/tests/
- `backend/tests/test_dataset_sampling_service.py` - service behavior tests.
- `backend/tests/test_markov_analysis.py` - Markov analysis endpoint validation and error-path tests.
- `backend/tests/test_markov_dataset_extraction.py` - Markov dataset extraction strategy and row-stochastic output tests.
- `backend/tests/test_text_vectorization.py` - token filtering/vectorization rule tests.

### demos/shared/
- `demos/shared/config/` - shared Vite + TypeScript configuration.
- `demos/shared/src/graph/` - shared directed-graph geometry, highlight, style, and SVG rendering modules.
- `demos/shared/src/lib/api.ts` - shared typed API client factory.
- `demos/shared/src/lib/dom.ts` - shared required-element and template helpers for panel/controller mounting.
- `demos/shared/src/lib/event-bus.ts` - shared typed pub/sub bus used by panel-controller orchestration.
- `demos/shared/src/lib/linear-algebra.ts` - shared matrix/vector helpers (incidence, `rref`, and basis extraction).
- `demos/shared/src/lib/layout-plan.ts` - recursive render-plan contracts and tree helpers.
- `demos/shared/src/lib/layout-renderer.ts` - shared recursive renderer with panel strategy registry support.
- `demos/shared/src/lib/layout-runtime.ts` - schema-to-runtime profile resolver, fallback handling, and CSS token/placement helpers.
- `demos/shared/src/lib/layout-schema.ts` - versioned layout schema contract for panel ids, parent hierarchy (`parentId`), and variant placements.
- `demos/shared/src/lib/store.ts` - shared reducer-store helper with synchronous subscriptions.
- `demos/shared/src/lib/layout-validate.ts` - runtime layout schema validation checks.
- `demos/shared/src/lib/result.ts` - shared `Result<T>` helpers.
- `demos/shared/src/lib/types.ts` - shared matrix/vector runtime guards.
- `demos/shared/src/lib/math-text.ts` - shared cached math-label formatters (subscript/index/assignment) with style-selectable output modes.
- `demos/shared/src/lib/mathjax.ts` - shared lazy MathJax loader and static-label SVG rendering helper for `data-math-tex` elements.
- `demos/shared/src/ui/tokens.css` - shared design tokens (typography, spacing, palette, shell geometry).
- `demos/shared/src/ui/primitives.css` - shared panel/button UI primitives that consume `--ui-*` aliases.
- `demos/shared/src/ui/graph-primitives.css` - shared graph edge/node/label primitive classes.
- `demos/shared/src/ui/base-shell.css` - shared shell styling used by demos.

### demos/linalg-vectors/frontend/
- `demos/linalg-vectors/frontend/package.json` - vectors demo scripts and engine constraints.
- `demos/linalg-vectors/frontend/index.html` - Vite HTML entry.
- `demos/linalg-vectors/frontend/src/main.ts` - composition root and render/event orchestration.
- `demos/linalg-vectors/frontend/src/theme.css` - vectors demo theme stylesheet (token details in `DEMO-VECTORS.md`).
- `demos/linalg-vectors/frontend/src/style.css` - component/layout styles.
- `demos/linalg-vectors/frontend/src/app/` - UI app modules (state, layout, events, rendering, sampling).
- `demos/linalg-vectors/frontend/src/lib/` - dataset API client and payload normalization.

### demos/linalg-matrix_transforms/frontend/
- `demos/linalg-matrix_transforms/frontend/src/main.ts` - matrix demo shell rendering and shared recursive panel rendering for `/health` checks.
- `demos/linalg-matrix_transforms/frontend/src/layout-options.ts` - matrix demo internal layout toggle and schema-backed profile resolution.
- `demos/linalg-matrix_transforms/frontend/src/lib/api.ts` - matrix demo API bindings.
- `demos/linalg-matrix_transforms/frontend/src/style.css` - matrix demo-specific styles.

### demos/linalg-markov_chains/frontend/
- `demos/linalg-markov_chains/frontend/package.json` - Markov demo scripts and engine constraints.
- `demos/linalg-markov_chains/frontend/index.html` - Vite HTML entry.
- `demos/linalg-markov_chains/frontend/src/main.ts` - composition root, shared layout mounting, store wiring, async worker-backed step orchestration, and panel-to-graph highlight wiring.
- `demos/linalg-markov_chains/frontend/src/layout-options.ts` - Markov demo schema-driven panel layout profile.
- `demos/linalg-markov_chains/frontend/src/style.css` - Markov demo styles for graph, controls, matrix table, and inline graph editors.
- `demos/linalg-markov_chains/frontend/src/app/` - reducer/store and panel renderers (graph/state/matrix).
- `demos/linalg-markov_chains/frontend/src/lib/` - Markov math/validation helpers, sparse-step diagnostics, and graph-generation strategies.

### demos/linalg-networks/frontend/
- `demos/linalg-networks/frontend/package.json` - networks demo scripts and engine constraints.
- `demos/linalg-networks/frontend/index.html` - Vite HTML entry.
- `demos/linalg-networks/frontend/src/main.ts` - composition root, shared layout mounting, event-bus command wiring, and panel registration.
- `demos/linalg-networks/frontend/src/layout-options.ts` - networks demo schema-driven panel layout profile.
- `demos/linalg-networks/frontend/src/style.css` - networks graph/vector/matrix/space panel styles.
- `demos/linalg-networks/frontend/src/app/` - reducer/actions/events and panel controllers.

### .agent/
- `.agent/rules/` - repo-specific agent operating rules.
- `.agent/workflows/` - local workflow docs.
- `.agent/skills/` - local skill docs and scripts.

## Entry Points

### Backend
- File: `backend/main.py`
- Run (repo root): `python -m uvicorn backend.main:app --reload --port 8000`
- Run (backend dir / Render): `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Routes:
  - `GET /health`
  - `GET /api/v1/info`
  - `GET /api/v1/datasets`
  - `GET /api/v1/datasets/samples`
  - `GET /api/v1/markov/datasets`
  - `GET /api/v1/markov/datasets/{datasetId}/presets`
  - `POST /api/v1/markov/datasets/{datasetId}/extract`
  - `POST /api/v1/matrix/apply`
  - `POST /api/v1/matrix/eig`
  - `POST /api/v1/markov/analyze`

### Frontend
- Preferred workspace commands (repo root):
  - `pnpm dev:vectors`
  - `pnpm dev:matrix`
  - `pnpm dev:markov`
  - `pnpm dev:networks`
  - `pnpm build:vectors`
  - `pnpm build:matrix`
  - `pnpm build:markov`
  - `pnpm build:networks`
  - `pnpm typecheck`
- Per-demo commands remain available in each demo folder (`pnpm dev`, `pnpm build`, `pnpm preview`).

## Key Modules And Responsibilities (By Location)

### backend/
- `backend/main.py` - app configuration, CORS policy, health/info, matrix APIs, Markov analysis endpoint, and Markov dataset extraction router wiring.
- `backend/datasets.py` - dataset loading/caching and modality-specific sample shaping.

### backend/api/routes/
- `backend/api/routes/datasets.py` - request validation and dataset service delegation.
- `backend/api/routes/markov_datasets.py` - Markov dataset extraction route surface and request payload parsing.

### backend/services/
- `backend/services/dataset_sampling.py` - dataset route service contract and exception-to-HTTP normalization.
- `backend/services/markov_dataset_service.py` - route-facing extraction orchestration and HTTP exception mapping.
- `backend/services/markov_dataset_extraction.py` - web-Google loader/cache, extraction strategy registry, and induced-transition-matrix builder.
- `backend/services/text_vectorization.py` - token cleaning/filtering policy for text vectors.

### demos/shared/src/lib/
- `demos/shared/src/lib/api.ts` - reusable API client with runtime validation and `Result` responses.
- `demos/shared/src/lib/dom.ts` - reusable required-element/template helpers for panel/controller composition.
- `demos/shared/src/lib/event-bus.ts` - reusable typed pub/sub for command/state fanout between controllers.
- `demos/shared/src/lib/linear-algebra.ts` - reusable incidence matrix, matrix-vector multiply, `rref`, and basis extraction helpers.
- `demos/shared/src/lib/layout-plan.ts` - recursive plan types and depth-first flatten helper.
- `demos/shared/src/lib/layout-renderer.ts` - shared recursive renderer with panel registry and optional visibility filters.
- `demos/shared/src/lib/layout-runtime.ts` - shared schema resolver and runtime helpers for panel style/token application.
- `demos/shared/src/lib/layout-schema.ts` - shared versioned schema types for panel hierarchy (`parentId`) and placement definitions.
- `demos/shared/src/lib/layout-validate.ts` - shared runtime validation for schema integrity and cross-reference checks.
- `demos/shared/src/lib/result.ts` - helpers for `ok/fail` result construction.
- `demos/shared/src/lib/store.ts` - reusable reducer store helper used by multiple demos.
- `demos/shared/src/lib/types.ts` - reusable matrix/vector type guards and assertions.
- `demos/shared/src/lib/math-text.ts` - shared math text formatter/cache utilities for indexed symbols and assignments.
- `demos/shared/src/lib/mathjax.ts` - shared static-label MathJax rendering helpers with graceful text fallback.

### demos/shared/src/graph/
- `demos/shared/src/graph/types.ts` - shared graph scene/interaction/presentation type contracts.
- `demos/shared/src/graph/highlight.ts` - reusable graph hover/selection sanitization and highlight set derivation.
- `demos/shared/src/graph/style.ts` - reusable graph style tokens/helpers for edge/node color, stroke, opacity, and filter behavior.
- `demos/shared/src/graph/geometry.ts` - reusable quadratic-edge and self-loop SVG path builders.
- `demos/shared/src/graph/render-svg.ts` - reusable directed-graph SVG renderer used by graph-based demos.

### demos/linalg-vectors/frontend/src/
- `demos/linalg-vectors/frontend/src/main.ts` - app composition root, reducer dispatch loop, render pass.
- `demos/linalg-vectors/frontend/src/theme.css` - vectors demo theme source (token inventory maintained in `DEMO-VECTORS.md`).
- `demos/linalg-vectors/frontend/src/style.css` - visual and layout implementation consuming tokens.

### demos/linalg-vectors/frontend/src/app/
- `bootstrap.ts` - startup flow (layout bootstrap + dataset catalog + initial sampling).
- `constants.ts` - demo constants (`VECTOR_WINDOW`, default dataset/image dimensions).
- `dataset-select.ts` - dataset selector option rendering with memoized signatures.
- `events.ts` - centralized DOM event/observer registration.
- `layout-config.ts` - CSS token readers and responsive layout config utilities.
- `layout-options.ts` - vectors demo internal toggles and schema-backed profile resolution (with fallback/warnings).
- `layout.ts` - pure grid layout calculations.
- `render-grid.ts` - sample grid rendering and selected-card updates.
- `render-selected.ts` - selected sample card rendering for image/text modalities.
- `render-vector.ts` - vector window row rendering for image and text datasets.
- `sampling.ts` - abortable replacement/append sampling controller.
- `state.ts` - app state model, reducer, and modality/offset helpers.
- `text-highlighting.ts` - text token rendering + text/vector cross-highlighting.
- `view.ts` - app shell template + recursive layout renderer integration + typed DOM reference binding.

### demos/linalg-vectors/frontend/src/lib/
- `api.ts` - vectors demo API layer: dataset catalog/sample endpoints plus shared `health`/`matrixApply`/`eigen` exports from shared API utilities.
- `dataset.ts` - payload normalization, image conversion, typed sample models.
- `types.ts` - dataset request/response runtime guards and shared type aliases.

### demos/linalg-matrix_transforms/frontend/src/
- `main.ts` - demo shell rendering, recursive layout-plan rendering, and `/health` check interaction.
- `layout-options.ts` - internal layout mode toggle and active strategy selection.
- `lib/api.ts` - matrix demo API exports.

### demos/linalg-markov_chains/frontend/src/
- `main.ts` - Markov demo bootstrap, shared layout-plan rendering, reducer store setup, node-count random-graph regeneration, dataset extraction API orchestration, worker-backed async step lifecycle (`STEP_REQUEST/SUCCESS/FAILURE`) with runtime timing pill, graph auto-step run/pause loop, pending matrix auto-normalization on cross-panel click, panel-input hover/focus edge/node highlighting, and transposed-matrix panel edge-target mapping.
- `layout-options.ts` - internal layout mode selection for top graph/state row and bottom matrix panel.
- `style.css` - Markov graph visuals, flow particles, state controls, and matrix editor styling.

### demos/linalg-markov_chains/frontend/src/app/
- `types.ts` - canonical app state contracts for matrix/vector editing, flow animation, pending-matrix-normalization tracking, and async step-compute lifecycle telemetry.
- `actions.ts` - reducer action union for matrix/vector edits, graph-inline node/edge edits, state-vector Enter-commit reset/normalization actions, and async step lifecycle actions.
- `reducer.ts` - pure state transitions including graph-inline edit semantics (row normalization and node-value reset behavior), state-vector Enter workflows (`current -> reset initial`, `initial -> normalize + reset`), deferred matrix normalization tracking, pre-step pending-matrix row normalization, async step lifecycle state updates, and flow-animation metadata generation on each step.
- `store.ts` - thin re-export of shared reducer-store helper (`@shared/lib/store`) for demo-local imports.
- `edit-session.ts` - edit-target types and edit mode/session state contracts shared across panels.
- `edit-value-input.ts` - shared numeric draft parsing/formatting plus overwrite-mode keyboard/caret helpers.
- `panel-context.ts` - graph-derived context contract consumed by matrix/state panels.
- `selectors.ts` - derived accessors that resolve committed values vs in-progress draft edits.
- `dom-helpers.ts` - thin re-export of shared template/query DOM helpers (`@shared/lib/dom`).
- `panel-shared.ts` - shared matrix/state panel helpers for scope windowing, target keys, and highlight colors.
- `graph-layout.ts` - strategy-based graph layout engine with deterministic probability-aware positioning and fallback radial strategy.
- `graph-data.ts` - graph render-data adapter for full-graph and top-state-mass subgraph extraction.
- `graph-interaction-presenter.ts` - pure presenter utilities for graph hover/selection, highlight sets, and selected node/edge edit-model derivation.
- `graph-viewport.ts` - clamped zoom/pan transform model for the SVG viewport layer.
- `node-label.ts` - shared node-label format helpers (`N` with subscript index) reused by multiple panels.
- `render-graph.ts` - SVG directed-graph rendering with constrained cubic edge geometry, arc-based self-loops, probability-aware styling, graph-local controls, interaction highlighting, inline on-graph value overlays/editors, subgraph-aware drawing, constrained viewport transform support (Ctrl+wheel and +/- zoom, arrow/right-drag pan with visible-node guarantees), editor-dismiss behavior (`Enter` or off-target click), and edge-aligned clustered flow-particle ("glob") animation.
- `render-state-panel.ts` - right-side controls for state vectors, auto-step toggle, and Enter-to-commit reset/normalization workflows.
- `render-matrix-panel.ts` - transition-matrix table rendering as a transposed view (`P^T`) with column normalization controls and windowed row/column navigation.
- `step-runtime.ts` - worker orchestration API (`beginStep`, `beginStepBatch`) and stale-request-safe promise routing.
- `step-runtime-messages.ts` - typed worker protocol for matrix-cache updates, single-step, and batch-step requests.
- `workers/markov-step.worker.ts` - worker-side cached sparse matrix stepping and unchanged flow-animation payload generation.

### demos/linalg-markov_chains/frontend/src/lib/
- `markov.ts` - Markov math helpers (step, normalization, resize), validation diagnostics, shared row normalization, and flow-particle planning with source-node-weighted, intra-glob non-overlapping slot offsets.
- `markov-sparse.ts` - CSR sparse matrix build + sparse row-vector stepping (`O(E)` path used by worker runtime).
- `markov-sparse-self-check.ts` - deterministic development-only sparse parity/performance check harness.
- `transition-graph-generator.ts` - strategy-based transition graph generators (random directed/no-self default) returning matrix + state vectors.
- `dataset-api.ts` - Markov dataset catalog/extraction API wrapper with runtime contract validation.

### demos/linalg-networks/frontend/src/
- `main.ts` - networks demo bootstrap, shared layout-plan mounting, controller registry, and event-bus/store wiring.
- `layout-options.ts` - networks layout mode selection for top (graph/flow) and bottom (matrix/spaces) panel rows.
- `style.css` - networks demo visuals for graph, vectors, matrix tables, and basis controls.

### demos/linalg-networks/frontend/src/app/
- `types.ts` - canonical networks app state contracts for nodes/edges/flows and derived matrix-space data.
- `actions.ts` - reducer action union for node/edge edits, flow edits, and basis selection.
- `events.ts` - typed event-bus contract for command events and panel state fanout.
- `reducer.ts` - pure state transitions for graph edits plus derived incidence/imbalance/rref/basis recomputation.
- `graph-layout.ts` - deterministic circular node layout helper for SVG graph rendering.
- `panels/graph-panel.ts` - graph editing controls and shared directed-graph SVG rendering with on-graph flow/imbalance labels.
- `panels/flow-panel.ts` - editable edge-flow vector and computed imbalance vector column displays.
- `panels/matrix-panel.ts` - incidence matrix and `rref(M)` table rendering.
- `panels/spaces-panel.ts` - row/column/null basis button groups and selected-basis column-vector display.

## Global Parameters / Constants

- `CORS_ALLOW_ORIGINS` - backend CORS allowlist.
- `OPENML_TRAIN_COUNT` (`backend/datasets.py`) - train/test split boundary for OpenML datasets.
- `MAX_DATASET_SAMPLES` (`backend/api/routes/datasets.py`) - dataset sample query upper bound.
- `DEFAULT_TARGET_NODE_COUNT`, `MIN_TARGET_NODE_COUNT`, `MAX_TARGET_NODE_COUNT` (`backend/services/markov_dataset_extraction.py`) - Markov dataset extraction node-count bounds/default.
- `VITE_API_BASE_URL` - frontend API base URL override.
- `VECTOR_WINDOW` (`demos/linalg-vectors/frontend/src/app/constants.ts`) - visible vector component window size.
- `LAYOUT_SCHEMA_VERSION` (`demos/shared/src/lib/layout-schema.ts`) - active schema version used by layout config validation/resolution.
- `VECTORS_LAYOUT_MODE` (`demos/linalg-vectors/frontend/src/app/layout-options.ts`) - vectors demo layout mode toggle (`sideBySide` or `stackedVertical`).
- `INCLUDE_DEBUG_PANEL` (`demos/linalg-vectors/frontend/src/app/layout-options.ts`) - vectors demo debug panel include/exclude toggle.
- `USE_RECURSIVE_LAYOUT_ENGINE` (`demos/linalg-vectors/frontend/src/app/view.ts`) - temporary vectors internal migration toggle between recursive and legacy layout rendering paths.
- `MATRIX_LAYOUT_MODE` (`demos/linalg-matrix_transforms/frontend/src/layout-options.ts`) - matrix demo layout mode toggle (`sideBySide` or `stackedVertical`).
- `MARKOV_LAYOUT_MODE` (`demos/linalg-markov_chains/frontend/src/layout-options.ts`) - Markov demo layout mode toggle (`sideBySide` or `stackedVertical`).
- `MIN_NODE_COUNT`, `MAX_NODE_COUNT`, `DEFAULT_NODE_COUNT` (`demos/linalg-markov_chains/frontend/src/lib/markov.ts`) - manual/random editor node-count bounds/default (dataset extraction mode can load larger subgraphs).
- `NETWORKS_LAYOUT_MODE` (`demos/linalg-networks/frontend/src/layout-options.ts`) - networks demo layout mode toggle (`sideBySide` or `stackedVertical`).
- `MAX_NODES`, `MAX_EDGES` (`demos/linalg-networks/frontend/src/app/reducer.ts`) - networks demo graph-size limits for nodes and directed edges.
- `DATA_ROOT`, `OPENML_DATA_HOME`, `LFW_DATA_HOME`, `NEWSGROUPS_DATA_HOME` (`backend/datasets.py`) - on-disk dataset cache roots.

## Global Objects / Shared State

- `backend/main.py::app` (`FastAPI`) - process-lifetime app instance with middleware/routes.
- `backend/datasets.py::_raw_dataset_cache` and `_split_dataset_cache` - process-lifetime dataset caches.
- `demos/linalg-vectors/frontend/src/main.ts::state` - browser-lifetime vectors app state.
- `demos/linalg-markov_chains/frontend/src/main.ts::store` - browser-lifetime Markov app store.
- `demos/linalg-networks/frontend/src/main.ts::store` - browser-lifetime networks app store.

## Key Functions/Methods (By Location)

### backend/main.py
- `_cors_origins() -> list[str]` - parses and normalizes `CORS_ALLOW_ORIGINS`.
- `_validate_matrix(raw_matrix) -> np.ndarray` - validates finite numeric matrix payload.
- `_validate_vector(raw_vector, expected_length) -> np.ndarray` - validates finite numeric vector payload.
- `_validate_probability_vector(raw_vector, expected_length, vector_name) -> np.ndarray` - validates finite non-negative vectors that sum to 1.
- `_validate_row_stochastic_matrix(matrix) -> np.ndarray` - validates square non-negative transition matrix rows sum to 1.
- `_step_markov_vector(current_vector, transition_matrix) -> np.ndarray` - computes one Markov update using row-vector convention.
- `_stationary_distribution(transition_matrix) -> tuple[np.ndarray, float]` - estimates stationary distribution and residual.
- `_serialize_complex(value) -> dict` - serializes complex eigenvalues into real/imag/magnitude triplets.
- `matrix_apply(payload) -> dict` - applies matrix-vector multiplication.
- `matrix_eig(payload) -> dict` - computes real-valued eigendecomposition for square matrices.
- `markov_analyze(payload) -> dict` - validates Markov payload, computes step/stationary diagnostics, eigenvalue magnitudes, and spectral gap.

### backend/api/routes/datasets.py
- `datasets() -> dict` - returns dataset catalog response.
- `dataset_samples(...) -> dict` - validates query params and delegates to service.

### backend/api/routes/markov_datasets.py
- `markov_datasets() -> dict` - returns Markov dataset + preset catalog metadata.
- `markov_dataset_presets(dataset_id) -> dict` - returns available extraction presets for one dataset id.
- `markov_dataset_extract(dataset_id, payload) -> dict` - validates request payload and delegates extraction to the service layer.

### backend/services/dataset_sampling.py
- `list_dataset_catalog() -> dict` - builds frontend dataset metadata payload.
- `sample_dataset_response(...) -> dict` - wraps dataset sampling with HTTP-friendly error mapping.

### backend/services/markov_dataset_service.py
- `markov_dataset_catalog_response() -> dict` - exposes catalog metadata for Markov extraction controls.
- `markov_dataset_presets_response(dataset_id) -> dict` - returns preset metadata with HTTP-friendly error mapping.
- `markov_extract_response(...) -> dict` - runs extraction and serializes response payloads for frontend use.

### backend/services/markov_dataset_extraction.py
- `list_markov_dataset_catalog() -> dict` - returns dataset + preset metadata and defaults.
- `extract_markov_subgraph(options, graph_override?) -> MarkovExtractResult` - extracts a preset subgraph and builds row-stochastic transition data.
- `_load_web_google_graph(path) -> DirectedGraphStore` - parses and caches sparse adjacency structures from the SNAP edge list.
- `_build_induced_transition_matrix(...)` - builds normalized row-stochastic transitions with configurable dangling handling.

### backend/services/text_vectorization.py
- `strip_email_addresses(text) -> str` - removes emails and normalizes case.
- `is_valid_vocab_token(token) -> bool` - applies token admissibility rules.
- `tokenize_newsgroup_text(text) -> list[str]` - tokenizes and filters words for vectors.
- `create_20newsgroups_vectorizer(max_features=9999)` - returns configured `CountVectorizer`.

### backend/datasets.py
- `available_datasets() -> list[dict[str, str]]` - returns dataset catalog entries.
- `get_dataset(dataset, split) -> DatasetView` - cached dataset/split loader.
- `sample_dataset(count, dataset, seed, split) -> dict` - returns serialized sampled payload for image/text datasets.
- `_prepare_dataset_view(raw_dataset, split) -> DatasetView` - split-aware modality shaping.
- `_slice_images_for_split(...)` - train/test/all split slicing for image datasets.
- `_slice_texts_for_split(...)` - split slicing for text datasets.
- `_first_sentence(text, max_length=200) -> str` - thumbnail snippet extraction for text samples.

### demos/shared/src/lib/api.ts
- `getApiBaseUrl() -> string` - resolves base URL from env with dev/prod fallback.
- `createApiClient(baseUrl?) -> ApiClient` - creates low-level JSON request client.
- `createApi(options?) -> ApiService` - feature-flagged typed API wrapper.

### demos/shared/src/lib/dom.ts
- `createTemplateElement(markup, context?)` - creates and validates a single-root `HTMLElement` from template markup.
- `requireElement(root, selector)` - required-query helper that throws for missing elements.

### demos/shared/src/lib/event-bus.ts
- `createEventBus<Events>()` - typed pub/sub bus for command and state fanout across controllers.

### demos/shared/src/lib/linear-algebra.ts
- `buildDirectedIncidenceMatrix(nodeCount, edges)` - builds node-row/edge-column directed incidence matrix.
- `multiplyMatrixVector(matrix, vector)` - computes matrix-column-vector multiplication.
- `computeRref(matrix)` - computes reduced row echelon form and pivot columns.
- `rowSpaceBasis(matrix)`, `columnSpaceBasis(matrix)`, `nullSpaceBasis(matrix)` - derives basis vectors for core subspaces.

### demos/shared/src/lib/layout-runtime.ts
- `resolveLayoutProfile(options)` - resolves requested schema variant, validates schema, and builds recursive render plans.
- `applyLayoutTokens(root, tokens)` - applies layout token overrides as CSS custom properties.
- `placementToInlineStyle(placement)` - serializes resolved placement constraints into inline style declarations.
- `logLayoutWarnings(context, warnings)` - emits normalized runtime warning logs for invalid schema/fallback paths.

### demos/shared/src/lib/layout-plan.ts
- `flattenLayoutPlan(roots)` - flattens recursive render nodes into deterministic depth-first order.

### demos/shared/src/lib/layout-renderer.ts
- `renderLayoutPlan(options)` - recursively mounts panel nodes using renderer strategies and returns panel root lookup map.

### demos/shared/src/lib/layout-schema.ts
- `LAYOUT_SCHEMA_VERSION` - active layout schema version constant.
- `LayoutSchema`, `LayoutPanelDef`, `LayoutVariant`, `LayoutPlacement` - type contracts for schema-driven layout configuration and recursive panel trees via `parentId`.

### demos/shared/src/lib/layout-validate.ts
- `validateLayoutSchema(schema)` - validates layout schema structure and panel/variant cross references.

### demos/shared/src/lib/result.ts
- `ok(value)` - constructs success result.
- `fail(error)` - constructs failure result.
- `buildError(message, status, bodyText?)` - structured API error payload.

### demos/shared/src/lib/store.ts
- `createStore(initialState, reducer)` - creates reducer store with `getState/dispatch/subscribe` APIs.

### demos/shared/src/lib/types.ts
- `isVec`, `isMat` - runtime guards for vector/matrix values.
- `assert(condition, message)` - shared assertion helper.

### demos/shared/src/lib/math-text.ts
- `formatSubscriptIndex(value)` - cached unicode subscript formatter for index rendering.
- `formatIndexedMathSymbol(...)` - style-selectable indexed symbol formatter for plain text or HTML contexts.
- `formatIndexedMathAssignment(...)` - indexed assignment formatter (`f_i=value`) for dynamic labels.
- `mathTextClassName(style)` - shared CSS class resolver for current vs tex-like math text styles.

### demos/shared/src/lib/mathjax.ts
- `renderStaticMathLabels({ root, style?, selector? })` - typesets `data-math-tex` labels to SVG via lazy-loaded MathJax.
- `queueStaticMathLabels(...)` - fire-and-forget wrapper for one-time static label rendering.

### demos/shared/src/graph/highlight.ts
- `edgePathKey(fromIndex, toIndex)` - stable directed-edge key helper shared across graph demos.
- `sanitizeGraphInteractionState(interaction, nodeCount)` - drops stale hover/selection targets when graph size changes.
- `buildGraphHighlightPresentation({ interaction, nodeCount, edges, minEdgeWeight? })` - computes highlighted nodes/edges for hover/select states.
- `readGraphInteractionTargetFromElement(target)` - maps DOM dataset attributes to typed graph interaction targets.

### demos/shared/src/graph/render-svg.ts
- `renderDirectedGraphSvg({ svg, scene, presentation })` - reusable SVG renderer for directed graph edges/nodes/labels with shared highlight styling.

### demos/shared/src/graph/style.ts
- `edgeStrokeWidth(weight)`, `edgeOpacity(weight)` - shared edge visual scaling helpers.
- `colorForGraphNodeValue(value)`, `colorForGraphHighlightedNodeValue(value)` - shared node fill color mappers.

### demos/linalg-vectors/frontend/src/main.ts
- `dispatch(action)` - reducer dispatch + render trigger.
- `updateLayoutFromGridSize(width, height, options?)` - computes modality-aware grid layout.
- `render(current)` - top-level view reconciliation for all UI panels.

### demos/linalg-vectors/frontend/src/app/bootstrap.ts
- `initializeVectorsApp(...)` - startup sequence for layout bootstrap and first dataset load.

### demos/linalg-vectors/frontend/src/app/sampling.ts
- `createSamplingController(...)` - creates append/replace/trim sampling workflow with cancellation.
- `replaceSamples(count)` - cancels stale requests and fetches fresh sample set.
- `syncSamplesToTarget(targetCount)` - reconciles sample list size to current grid target.

### demos/linalg-vectors/frontend/src/app/state.ts
- `reducer(state, action) -> AppState` - central state transitions.
- `clampOffset(offset, vectorLength)` - bounds vector window offset.
- `getSelectedVectorLength(state, selected)` - modality-aware vector length resolution.
- `getActiveModality(state)` - active modality inference from metadata/catalog.

### demos/linalg-vectors/frontend/src/app/events.ts
- `attachAppEventHandlers(...)` - binds grid/slider/wheel/keyboard/text/image interaction handlers.

### demos/linalg-vectors/frontend/src/app/render-selected.ts
- `createSelectedRenderer(...)` - selected card rendering for image/text modes.

### demos/linalg-vectors/frontend/src/app/render-vector.ts
- `createVectorRenderer(...)` - vector row and range rendering for both modalities.

### demos/linalg-vectors/frontend/src/app/text-highlighting.ts
- `createTextHighlightingController(...)` - tokenized text rendering + text/vector highlight synchronization.

### demos/linalg-vectors/frontend/src/app/layout.ts
- `computeGridLayout(...)` - responsive row/column calculation.
- `computeRowCount(height, rowSize, rowGap)` - row count calculation helper.

### demos/linalg-vectors/frontend/src/app/layout-config.ts
- `getGridTileMin()`, `getGridTileMax(min)` - tile-size configuration from CSS tokens.
- `getGridGaps(gridEl)` - reads live CSS grid gaps.
- `getGridTargetHeight()` - viewport-derived target grid height.
- `getTextGridColumns()` - document-table column count from CSS tokens.

### demos/linalg-vectors/frontend/src/app/view.ts
- `createAppView(rootSelector?) -> AppView` - renders profile-driven panel ordering and conditionally binds debug elements.

### demos/linalg-vectors/frontend/src/lib/dataset.ts
- `loadDatasetSamples(dataset, count, seed?, signal?)` - fetches and normalizes dataset sample payload.
- `toImageData(sample, imageWidth, imageHeight)` - converts grayscale bytes to `ImageData`.

### demos/linalg-vectors/frontend/src/lib/api.ts
- `listDatasets()` - fetches and validates dataset catalog metadata.
- `datasetSamples(dataset, count, seed?, split?, signal?)` - fetches and validates dataset sample payloads.
- `health`, `matrixApply`, `eigen` - shared backend API bindings re-exported for parity with other demos.

### demos/linalg-markov_chains/frontend/src/main.ts
- `render()` - fan-out render pass for graph/state/matrix panels from canonical store state.
- `loadDatasetCatalog()` / `extractDatasetSubgraph()` - async Markov dataset mode API orchestration and reducer dispatch bridge.

### demos/linalg-markov_chains/frontend/src/app/reducer.ts
- `createInitialState() -> AppState` - initializes default transition matrix/state vectors and validation.
- `reducer(state, action) -> AppState` - handles all edits, generated-graph apply, graph-inline edge/node edit rules, state-vector Enter-commit reset/normalization actions, deferred matrix normalization tracking, and stepping.

### demos/linalg-markov_chains/frontend/src/app/selectors.ts
- `selectDisplayedTransitionCell(state, fromIndex, toIndex)` - resolves edge values from draft edits when present, else committed matrix values.
- `selectDisplayedInitialValue(state, index)` / `selectDisplayedNodeValue(state, index)` - resolve panel-visible values during edit sessions.

### demos/linalg-markov_chains/frontend/src/app/edit-value-input.ts
- `readNonNegativeDraftInputValue(input, options?)` - shared sanitization/parsing flow for all numeric edit inputs.
- `formatEditableInputValue(value)` - compact value formatter for editable panel/inline input controls.
- `shouldUseDestructiveOverwrite(event)` - detects printable key presses that should replace currently selected input content.

### demos/linalg-markov_chains/frontend/src/app/panel-shared.ts
- `resolveScopedNodeIndices(context)` - computes panel node scope for `full-extracted` vs `visible-only` modes.
- `alignWindowStartToIncludeIndex(...)` - keeps slider windows aligned to active/selected targets.
- `colorForPanelBlue(value, alpha)` / `colorForPanelRed(value, alpha)` - shared panel highlight color mapping.

### demos/linalg-markov_chains/frontend/src/app/graph-layout.ts
- `createGraphLayoutEngine(options?)` - registers layout strategies and resolves active strategy at render time.
- `probabilityToEdgeLength(probability, minLength, maxLength)` - linearly maps probability to edge-length target for graph geometry.

### demos/linalg-markov_chains/frontend/src/app/graph-data.ts
- `buildGraphRenderData(state, selection) -> GraphRenderData` - derives render-ready matrix/vector/index maps and edge key sets for full graph or subgraph modes.

### demos/linalg-markov_chains/frontend/src/app/graph-viewport.ts
- `normalizeGraphViewportTransform(transform, fallback) -> GraphViewportTransform` - clamps external zoom/pan updates into safe bounds.

### demos/linalg-markov_chains/frontend/src/app/graph-interaction-presenter.ts
- `sanitizeGraphInteractionState(interaction, nodeCount)` - removes invalid hover/selection targets when node counts change.
- `buildGraphInteractionPresentation(appState, interaction)` - combines shared highlight derivation with Markov selected-edit models.

### demos/linalg-markov_chains/frontend/src/lib/markov.ts
- `buildValidationSummary(...) -> ValidationSummary` - validates matrix/vector probability constraints and step/analyze gates.
- `stepVector(currentVector, transitionMatrix) -> number[]` - computes `x_{t+1} = x_t P`.
- `createFlowAnimation(...) -> FlowAnimationState` - computes per-edge mass transfer and particle timing for animated updates.

### demos/linalg-markov_chains/frontend/src/lib/transition-graph-generator.ts
- `createTransitionGraphGenerator(options?)` - registers generation strategies and produces transition matrices/state vectors for requested node counts.

### demos/linalg-markov_chains/frontend/src/lib/dataset-api.ts
- `createMarkovDatasetApi()` - creates typed API methods for Markov dataset catalog and subgraph extraction endpoints.
- `validateCatalogResponse(...)` / `validateExtractResponse(...)` - runtime guards for dataset-mode response contracts.

### demos/linalg-networks/frontend/src/main.ts
- command-event handlers (`command:*`) - maps panel command events into reducer actions.
- state broadcast (`state:changed`) - emits canonical `NetworksState` snapshots to all panel controllers.
- static math-label bootstrap (`queueStaticMathLabels`) - typesets shell-level fixed formulas while leaving dynamic labels on lightweight formatters.

### demos/linalg-networks/frontend/src/app/reducer.ts
- `createInitialState() -> NetworksState` - seeds default graph/flow values and derived matrix-space state.
- `reducer(state, action) -> NetworksState` - enforces graph constraints, applies edits, and recomputes derived state.
- `selectedBasisVector(state)` - resolves selected basis vector for UI rendering.

### demos/linalg-networks/frontend/src/app/panels/graph-panel.ts
- `createGraphPanelController(bus)` - graph controls and shared directed-graph SVG rendering with dynamic, style-selectable flow/imbalance math labels.

### demos/linalg-networks/frontend/src/app/panels/flow-panel.ts
- `createFlowPanelController(bus)` - edge flow vector editing and `b = M f` column-vector display with MathJax static formulas and cached dynamic label formatting.

### demos/linalg-networks/frontend/src/app/panels/matrix-panel.ts
- `createMatrixPanelController(bus)` - incidence matrix and `rref` displays (`M`, `rref(M)`, `rref(M^T)`) with MathJax static headings.

### demos/linalg-networks/frontend/src/app/panels/spaces-panel.ts
- `createSpacesPanelController(bus)` - basis button rendering and selected-basis column-vector output with static `Row/Col/Null` MathJax labels.

## Theme And Style Tokens

### Global Token Sources
- `demos/shared/src/ui/tokens.css` - canonical shared token definitions used across demos.
- `demos/shared/src/ui/base-shell.css` - shared shell token aliases (`--ui-*`) that wire shared primitives.
- `demos/shared/src/ui/primitives.css` - shared primitive selectors that consume `--ui-*` aliases.
- `demos/shared/src/ui/graph-primitives.css` - shared graph edge/node/label classes consumed by Markov and Networks graph panels.
- Demo-specific token inventories are intentionally documented in `DEMO-*.md` files.

### Global Base Tokens (`tokens.css`)
- Typography: `--base-font-sans`, `--base-font-mono`, `--math-font-current`, `--math-font-tex-like`.
- Spacing scale: `--base-space-0` through `--base-space-9`.
- Palette: `--base-ink`, `--base-ink-soft`, `--base-paper`, `--base-surface`, `--base-surface-2`, `--base-accent`, `--base-accent-2`, `--base-accent-contrast`.
- Borders and effects: `--base-border`, `--base-shadow`, `--base-shadow-soft`, `--base-focus-accent`, `--base-focus-teal`, `--base-shadow-accent`, `--base-shadow-accent-soft`.
- Geometry and shell sizing: `--base-radius`, `--base-panel-radius`, `--base-gap`, `--base-shell-max-width`, `--base-shell-padding`, `--base-shell-min-height`.
- Background gradients: `--base-bg-radial-1`, `--base-bg-radial-2`, `--base-bg-linear-top`, `--base-bg-linear-bottom`.

### Global Primitive Alias Tokens (`base-shell.css`)
- Panel aliases: `--ui-panel-bg`, `--ui-panel-border`, `--ui-panel-radius`, `--ui-panel-padding`, `--ui-panel-shadow`.
- Button aliases: `--ui-button-bg`, `--ui-button-fg`, `--ui-button-padding`, `--ui-button-radius`, `--ui-button-font-weight`, `--ui-button-hover-shadow`, `--ui-button-focus-ring`.

## Data Contracts

- `GET /health`
  - Response: `{"status": "ok"}`
- `GET /api/v1/info`
  - Response: `{"service": string, "version": string}`
- `GET /api/v1/datasets`
  - Response: `{"defaultDataset": string, "datasets": [{"id","displayName","defaultSplit","modality"}]}`
- `GET /api/v1/datasets/samples`
  - Query: `dataset`, `count`, optional `split`, optional `seed`
  - Response common: `source`, `displayName`, `split`, `modality`, `imageWidth`, `imageHeight`, `vectorLength`, `totalCount`, `samples`
  - Text modality adds: top-level `vocab`, and per-sample `rawText`, `snippet`, `wordCounts[]`
- `POST /api/v1/matrix/apply`
  - Request: `{"matrix": number[][], "vector": number[]}`
  - Response: `{"result": number[]}`
- `POST /api/v1/matrix/eig`
  - Request: `{"matrix": number[][]}`
  - Response: `{"eigenvalues": number[], "eigenvectors": number[][]}`
- `POST /api/v1/markov/analyze`
  - Request: `{"transitionMatrix": number[][], "initialVector": number[], "currentVector": number[]}`
  - Response: `{"isRowStochastic": boolean, "rowSums": number[], "nextVector": number[], "stationaryDistribution": number[], "stationaryResidual": number, "spectralGap": number | null, "eigenvalues": [{"real": number, "imag": number, "magnitude": number}]}`

## External Dependencies

### Backend
- `fastapi`, `uvicorn`
- `python-multipart`
- `numpy`, `scipy`
- `scikit-learn`
- `pillow`

### Frontend
- `vite`, `typescript`, `@types/node`
- shared modules in `demos/shared`

## Deployment Notes (Render)

Current `render.yaml` services define only:
- `linalg-backend`
- `demo-linalg-vectors`
- `demo-linalg-matrix-transforms`

### `linalg-backend`
- `rootDir: backend`
- build: `pip install -r requirements.txt`
- start: `uvicorn main:app --host 0.0.0.0 --port $PORT`

### `demo-linalg-vectors`
- `rootDir: .`
- build: `npm i -g pnpm@10 && pnpm install --frozen-lockfile && pnpm --filter @linalg/demo-vectors build`
- publish: `demos/linalg-vectors/frontend/dist`

### `demo-linalg-matrix-transforms`
- `rootDir: .`
- build: `npm i -g pnpm@10 && pnpm install --frozen-lockfile && pnpm --filter @linalg/demo-matrix-transforms build`
- publish: `demos/linalg-matrix_transforms/frontend/dist`

### `demo-linalg-markov_chains`
- not currently defined as a Render service in `render.yaml`
- local build: `pnpm --filter @linalg/demo-markov_chains build`
- static publish path if deployed later: `demos/linalg-markov_chains/frontend/dist`

### `demo-linalg-networks`
- not currently defined as a Render service in `render.yaml`
- local build: `pnpm --filter @linalg/demo-networks build`
- static publish path if deployed later: `demos/linalg-networks/frontend/dist`



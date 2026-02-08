<!-- markdownlint-disable -->

# CODEMAP

## Repo Layout (By Location)

### Root
- `package.json` - root pnpm workspace scripts (`build`, `dev:*`, `typecheck`) and Volta Node pin.
- `pnpm-workspace.yaml` - workspace package discovery (`demos/*/frontend`).
- `pnpm-lock.yaml` - single lockfile for frontend workspace packages.
- `.nvmrc` - local Node pin (`25.6.0`).
- `render.yaml` - Render deployment definitions for backend + static demo frontends.
- `.agent/` - local agent rules, workflows, and skills used for this repo.
- `CODEMAP.md` - repository map and architecture summary.

### backend/
- `backend/main.py` - FastAPI app entrypoint, middleware wiring, matrix endpoints.
- `backend/datasets.py` - dataset registry, caching, split handling, and sample serialization.
- `backend/requirements.in` - direct runtime dependencies.
- `backend/requirements.txt` - compiled runtime lockfile.
- `backend/requirements-dev.in` - direct dev/test dependencies.

### backend/api/
- `backend/api/routes/datasets.py` - dataset catalog + sampling HTTP routes.
- `backend/api/routes/__init__.py` - route package marker.
- `backend/api/__init__.py` - API package marker.

### backend/services/
- `backend/services/dataset_sampling.py` - service layer for dataset route responses and HTTP error mapping.
- `backend/services/text_vectorization.py` - 20 Newsgroups tokenizer/filter/vectorizer policy.

### backend/tests/
- `backend/tests/test_dataset_sampling_service.py` - service behavior tests.
- `backend/tests/test_text_vectorization.py` - token filtering/vectorization rule tests.

### demos/shared/
- `demos/shared/config/` - shared Vite + TypeScript configuration.
- `demos/shared/src/lib/api.ts` - shared typed API client factory.
- `demos/shared/src/lib/result.ts` - shared `Result<T>` helpers.
- `demos/shared/src/lib/types.ts` - shared matrix/vector runtime guards.
- `demos/shared/src/ui/tokens.css` - shared design tokens (typography, spacing, palette, shell geometry).
- `demos/shared/src/ui/primitives.css` - shared panel/button UI primitives that consume `--ui-*` aliases.
- `demos/shared/src/ui/demo-shell.css` - shared shell styling used by demos.

### demos/linalg-vectors/frontend/
- `demos/linalg-vectors/frontend/package.json` - vectors demo scripts and engine constraints.
- `demos/linalg-vectors/frontend/index.html` - Vite HTML entry.
- `demos/linalg-vectors/frontend/src/main.ts` - composition root and render/event orchestration.
- `demos/linalg-vectors/frontend/src/theme.css` - design tokens.
- `demos/linalg-vectors/frontend/src/style.css` - component/layout styles.
- `demos/linalg-vectors/frontend/src/app/` - UI app modules (state, layout, events, rendering, sampling).
- `demos/linalg-vectors/frontend/src/lib/` - dataset API client and payload normalization.

### demos/linalg-matrix_transforms/frontend/
- `demos/linalg-matrix_transforms/frontend/src/main.ts` - matrix demo shell and backend health check action.
- `demos/linalg-matrix_transforms/frontend/src/lib/api.ts` - matrix demo API bindings.
- `demos/linalg-matrix_transforms/frontend/src/style.css` - matrix demo-specific styles.

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
  - `POST /api/v1/matrix/apply`
  - `POST /api/v1/matrix/eig`

### Frontend
- Workspace commands (repo root):
  - `pnpm dev:vectors`
  - `pnpm dev:matrix`
  - `pnpm build:vectors`
  - `pnpm build:matrix`
  - `pnpm typecheck`
- Per-demo commands remain available in each demo folder (`pnpm dev`, `pnpm build`, `pnpm preview`).

## Key Modules And Responsibilities (By Location)

### backend/
- `backend/main.py` - app configuration, CORS policy, health/info, matrix APIs.
- `backend/datasets.py` - dataset loading/caching and modality-specific sample shaping.

### backend/api/routes/
- `backend/api/routes/datasets.py` - request validation and dataset service delegation.

### backend/services/
- `backend/services/dataset_sampling.py` - dataset route service contract and exception-to-HTTP normalization.
- `backend/services/text_vectorization.py` - token cleaning/filtering policy for text vectors.

### demos/shared/src/lib/
- `demos/shared/src/lib/api.ts` - reusable API client with runtime validation and `Result` responses.
- `demos/shared/src/lib/result.ts` - helpers for `ok/fail` result construction.
- `demos/shared/src/lib/types.ts` - reusable matrix/vector type guards and assertions.

### demos/linalg-vectors/frontend/src/
- `demos/linalg-vectors/frontend/src/main.ts` - app composition root, reducer dispatch loop, render pass.
- `demos/linalg-vectors/frontend/src/theme.css` - vectors token aliases + vectors-specific sizing/layout tokens.
- `demos/linalg-vectors/frontend/src/style.css` - visual and layout implementation consuming tokens.

### demos/linalg-vectors/frontend/src/app/
- `bootstrap.ts` - startup flow (layout bootstrap + dataset catalog + initial sampling).
- `constants.ts` - demo constants (`VECTOR_WINDOW`, default dataset/image dimensions).
- `dataset-select.ts` - dataset selector option rendering with memoized signatures.
- `events.ts` - centralized DOM event/observer registration.
- `layout-config.ts` - CSS token readers and responsive layout config utilities.
- `layout.ts` - pure grid layout calculations.
- `render-grid.ts` - sample grid rendering and selected-card updates.
- `render-selected.ts` - selected sample card rendering for image/text modalities.
- `render-vector.ts` - vector window row rendering for image and text datasets.
- `sampling.ts` - abortable replacement/append sampling controller.
- `state.ts` - app state model, reducer, and modality/offset helpers.
- `text-highlighting.ts` - text token rendering + text/vector cross-highlighting.
- `view.ts` - app HTML template + required DOM reference binding.

### demos/linalg-vectors/frontend/src/lib/
- `api.ts` - vectors demo API bindings for dataset endpoints.
- `dataset.ts` - payload normalization, image conversion, typed sample models.
- `types.ts` - dataset request/response runtime guards and shared type aliases.

### demos/linalg-matrix_transforms/frontend/src/
- `main.ts` - demo shell rendering and `/health` check interaction.
- `lib/api.ts` - matrix demo API exports.

## Key Functions/Methods (By Location)

### backend/main.py
- `_cors_origins() -> list[str]` - parses and normalizes `CORS_ALLOW_ORIGINS`.
- `_validate_matrix(raw_matrix) -> np.ndarray` - validates finite numeric matrix payload.
- `_validate_vector(raw_vector, expected_length) -> np.ndarray` - validates finite numeric vector payload.
- `matrix_apply(payload) -> dict` - applies matrix-vector multiplication.
- `matrix_eig(payload) -> dict` - computes real-valued eigendecomposition for square matrices.

### backend/api/routes/datasets.py
- `datasets() -> dict` - returns dataset catalog response.
- `dataset_samples(...) -> dict` - validates query params and delegates to service.

### backend/services/dataset_sampling.py
- `list_dataset_catalog() -> dict` - builds frontend dataset metadata payload.
- `sample_dataset_response(...) -> dict` - wraps dataset sampling with HTTP-friendly error mapping.

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

### demos/shared/src/lib/result.ts
- `ok(value)` - constructs success result.
- `fail(error)` - constructs failure result.
- `buildError(message, status, bodyText?)` - structured API error payload.

### demos/shared/src/lib/types.ts
- `isVec`, `isMat` - runtime guards for vector/matrix values.
- `assert(condition, message)` - shared assertion helper.

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

### demos/linalg-vectors/frontend/src/lib/dataset.ts
- `loadDatasetSamples(dataset, count, seed?, signal?)` - fetches and normalizes dataset sample payload.
- `toImageData(sample, imageWidth, imageHeight)` - converts grayscale bytes to `ImageData`.

## Theme And Style Tokens (Vectors Frontend)

### Token Sources
- `demos/shared/src/ui/tokens.css` - shared baseline design tokens reused by demo shells and vectors aliases.
- `demos/shared/src/ui/primitives.css` - shared panel/button primitive selectors reused by demo-specific class names.
- `demos/linalg-vectors/frontend/src/theme.css` - global design/system tokens (`:root`).
- `demos/linalg-vectors/frontend/src/style.css` - consumes tokens and defines runtime CSS variables used by UI state.

### Typography And Spacing Tokens (`theme.css`)
- `--font-sans`, `--font-mono` - base sans/mono font stacks.
- `--space-0` .. `--space-9` - spacing scale used for gaps, padding, and margins.

### Color / Surface / Effect Tokens (`theme.css`)
- `--ink`, `--ink-soft` - primary and secondary text colors.
- `--paper`, `--surface`, `--surface-2` - page and panel background layers.
- `--accent`, `--accent-2`, `--accent-3`, `--accent-contrast` - primary accent palette.
- `--vector-outline` - selected image vector-window outline color.
- `--word-highlight` - RGB source tuple for word/vector highlight overlays.
- `--grid-line`, `--swatch-border` - border/stroke colors.
- `--shadow-soft`, `--shadow-panel`, `--shadow-tile`, `--shadow-accent`, `--shadow-accent-soft` - shadow colors.
- `--focus-accent`, `--focus-teal` - focus ring colors.
- `--bg-radial-1`, `--bg-radial-2`, `--bg-linear-top`, `--bg-linear-bottom` - page background gradients.
- `--selected-card-start`, `--selected-card-end`, `--debug-item-bg`, `--debug-log-bg` - panel-specific fills.
- `--canvas-bg` - grayscale swatch/canvas background fallback.

### Layout Tokens (`theme.css`)
- `--layout-left-width`, `--layout-right-width`, `--layout-split`, `--layout-gap` - two-panel layout geometry.
- `--app-max-width`, `--app-padding`, `--section-gap` - shell dimensions.
- `--panel-radius`, `--panel-padding`, `--panel-header-gap`, `--panel-header-margin-bottom` - panel chrome.
- `--hero-*` tokens - hero area sizing and spacing.

### Grid Tokens (`theme.css`)
- `--grid-gap`, `--grid-size` - table spacing and background grid texture size.
- `--grid-fallback-columns`, `--grid-fallback-rows` - initial table shape before measurement.
- `--grid-tile-min`, `--grid-tile-max` - responsive image tile sizing bounds.
- `--grid-max-samples` - upper sampling target bound.
- `--grid-height-vh` - viewport fraction used for target grid height.
- `--text-tile-min-height` - minimum row height for text dataset cards.

### Selected Card Tokens (`theme.css`)
- `--selected-card-radius`, `--selected-card-padding`, `--selected-card-gap`, `--selected-card-width` - selected card geometry.
- `--selected-text-card-width` - text-mode selected card width override.
- `--selected-card-top-offset` - vertical offset from panel header.
- `--selected-canvas-radius`, `--selected-canvas-padding`, `--selected-canvas-max-sm` - selected image canvas shape/sizing.
- `--selected-text-min-height`, `--selected-text-max-height` - selected text content viewport bounds.

### Vector Panel Tokens (`theme.css`)
- `--vector-shell-gap` - space between selected card and vector controls.
- `--vector-text-shell-padding-left` - text-mode horizontal offset for selected card + vector controls.
- `--vector-panel-min-height`, `--vector-panel-min-width`, `--vector-panel-padding`, `--vector-panel-radius` - vector panel geometry.
- `--vector-list-min-height`, `--vector-list-width`, `--vector-text-list-width` - vector list sizing.
- `--vector-index-width`, `--vector-index-bracket-gap`, `--vector-bracket-content-gap`, `--vector-value-bracket-gap`, `--vector-bracket-width` - bracket/index/value column geometry.
- `--vector-value-width`, `--vector-text-count-width` - numeric column widths.
- `--vector-text-word-width` - word-column width input.
- `--vector-text-bracket-word-gap`, `--vector-text-word-gap` - word/count spacing.
- `--vector-header-horizontal-offset` - horizontal nudge for `Components # - #` header.
- `--vector-slider-width`, `--vector-slider-gap`, `--vector-slider-min-height` - slider geometry.
- `--vector-swatch-size`, `--vector-swatch-col`, `--vector-swatch-value-gap` - swatch column geometry.
- `--vector-info-min-width` - combined minimum width for slider + vector list block.
- `--vector-hint-margin-top`, `--vector-range-width` - vector hint/range sizing helpers.

### Misc Tokens (`theme.css`)
- `--tile-radius`, `--tile-padding` - grid tile chrome.
- `--status-pill-padding`, `--status-pill-font-size`, `--status-pill-radius` - status badge sizing.
- `--panel-footer-margin` - panel footer spacing.

### Runtime Style Variables (Set By TS Or Interaction State)
- `--grid-columns`, `--grid-rows`, `--grid-row-size` - set by `demos/linalg-vectors/frontend/src/main.ts` for responsive table sizing.
- `--tile-aspect-ratio` - set per sample tile by `demos/linalg-vectors/frontend/src/app/render-grid.ts`.
- `--selected-canvas-aspect` - set by `demos/linalg-vectors/frontend/src/app/render-selected.ts` from dataset image dimensions.
- `--vector-text-word-width-dynamic` - set by `demos/linalg-vectors/frontend/src/app/text-highlighting.ts` from longest vocab token.
- `--word-highlight-alpha` - set on highlighted text spans in selected text content.
- `--vector-word-highlight-alpha` - set on highlighted vector rows in text mode.

## Global Parameters / Constants

- `CORS_ALLOW_ORIGINS` - backend CORS allowlist.
- `OPENML_TRAIN_COUNT` (`backend/datasets.py`) - train/test split boundary for OpenML datasets.
- `MAX_DATASET_SAMPLES` (`backend/api/routes/datasets.py`) - dataset sample query upper bound.
- `VITE_API_BASE_URL` - frontend API base URL override.
- `VECTOR_WINDOW` (`demos/linalg-vectors/frontend/src/app/constants.ts`) - visible vector component window size.
- `DATA_ROOT`, `OPENML_DATA_HOME`, `LFW_DATA_HOME`, `NEWSGROUPS_DATA_HOME` (`backend/datasets.py`) - on-disk dataset cache roots.

## Global Objects / Shared State

- `backend/main.py::app` (`FastAPI`) - process-lifetime app instance with middleware/routes.
- `backend/datasets.py::_raw_dataset_cache` and `_split_dataset_cache` - process-lifetime dataset caches.
- `demos/linalg-vectors/frontend/src/main.ts::state` - browser-lifetime vectors app state.

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

## External Dependencies

### Backend
- `fastapi`, `uvicorn`
- `numpy`, `scipy`
- `scikit-learn`
- `pillow`

### Frontend
- `vite`, `typescript`, `@types/node`
- shared modules in `demos/shared`

## Deployment Notes (Render)

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

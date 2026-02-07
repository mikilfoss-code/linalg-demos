<!-- markdownlint-disable -->

# CODEMAP

## Repo Layout

- `package.json` - root pnpm workspace scripts for build/dev/typecheck/test.
- `pnpm-workspace.yaml` - workspace package discovery (`demos/*/frontend`).
- `pnpm-lock.yaml` - single root lockfile for demo frontends.
- `backend/` - FastAPI backend and dataset engine.
- `backend/main.py` - API app entry, CORS config, health/info/matrix routes, router wiring.
- `backend/api/routes/datasets.py` - dataset catalog/sample routes.
- `backend/services/dataset_sampling.py` - dataset route service logic + HTTP error mapping.
- `backend/services/text_vectorization.py` - 20 Newsgroups tokenization and vectorizer config.
- `backend/datasets.py` - dataset registry/load/cache/split/sample serialization.
- `backend/requirements.in` - backend runtime direct dependencies.
- `backend/requirements.txt` - compiled backend runtime lockfile.
- `backend/requirements-dev.in` - backend dev/test dependency input.
- `backend/tests/` - backend tests for sampling service and text tokenization rules.
- `demos/shared/config/` - shared Vite and TypeScript base config.
- `demos/shared/src/lib/` - shared frontend API/result/type utilities.
- `demos/shared/src/ui/` - shared demo shell CSS.
- `demos/linalg-vectors/frontend/` - vectors demo frontend.
- `demos/linalg-vectors/frontend/src/app/` - vectors app modules (constants, state, dataset-select).
- `demos/linalg-vectors/frontend/src/app/bootstrap.ts` - startup sequence for dataset catalog/load.
- `demos/linalg-vectors/frontend/src/app/events.ts` - UI event wiring and responsive observers.
- `demos/linalg-vectors/frontend/src/app/layout-config.ts` - CSS token readers and responsive grid config helpers.
- `demos/linalg-vectors/frontend/src/app/layout.ts` - responsive grid layout calculations.
- `demos/linalg-vectors/frontend/src/app/render-grid.ts` - image/text grid rendering helpers.
- `demos/linalg-vectors/frontend/src/app/render-selected.ts` - selected image/text card rendering.
- `demos/linalg-vectors/frontend/src/app/render-vector.ts` - vector window rendering for image/text modalities.
- `demos/linalg-vectors/frontend/src/app/sampling.ts` - abortable sampling controller with bounded refill.
- `demos/linalg-vectors/frontend/src/app/text-highlighting.ts` - text/word highlight state and selected-text token rendering.
- `demos/linalg-vectors/frontend/src/app/view.ts` - app shell template and DOM element binding.
- `demos/linalg-vectors/frontend/src/lib/` - vectors API and dataset normalization.
- `demos/linalg-matrix_transforms/frontend/` - matrix transforms demo frontend scaffold.
- `.agent/` - local skills, workflows, and rules.
- `render.yaml` - Render deployment config for backend and static demos.
- `.nvmrc` - local Node version pin (`25.6.0`).

## Entry Points

### Backend

- File: `backend/main.py`
- Run (repo root): `python -m uvicorn backend.main:app --reload --port 8000`
- Run (Render backend root): `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Routes:
  - `GET /health`
  - `GET /api/v1/info`
  - `GET /api/v1/datasets`
  - `GET /api/v1/datasets/samples`
  - `POST /api/v1/matrix/apply`
  - `POST /api/v1/matrix/eig`

### Frontend

- Workspace dev/build (repo root):
  - `pnpm dev:vectors`
  - `pnpm dev:matrix`
  - `pnpm build:vectors`
  - `pnpm build:matrix`
- Per-demo local run remains supported from each demo folder via `pnpm dev` / `pnpm build`.

## Key Modules And Responsibilities

- `backend/main.py` - app wiring and matrix endpoints.
- `backend/api/routes/datasets.py` - dataset API route definitions and query validation.
- `backend/services/dataset_sampling.py` - central dataset route service methods.
- `backend/services/text_vectorization.py` - token filtering and CountVectorizer factory.
- `backend/datasets.py` - dataset load/cache/split/sample orchestration.
- `demos/shared/src/lib/api.ts` - shared API client with `Result<T>` wrapping.
- `demos/shared/src/lib/result.ts` - shared success/error result helpers.
- `demos/shared/src/lib/types.ts` - shared matrix/vector runtime guards.
- `demos/linalg-vectors/frontend/src/main.ts` - vectors app composition root and state-driven render orchestration.
- `demos/linalg-vectors/frontend/src/app/bootstrap.ts` - startup/catalog flow and first sample load.
- `demos/linalg-vectors/frontend/src/app/events.ts` - centralized handler wiring for grid/vector/text interactions.
- `demos/linalg-vectors/frontend/src/app/view.ts` - renders app shell markup and returns typed DOM references.
- `demos/linalg-vectors/frontend/src/app/layout-config.ts` - reads CSS layout tokens and measured grid spacing.
- `demos/linalg-vectors/frontend/src/app/state.ts` - state model, reducer, selection/offset logic, append dedupe.
- `demos/linalg-vectors/frontend/src/app/constants.ts` - vectors app constants.
- `demos/linalg-vectors/frontend/src/app/dataset-select.ts` - memoized dataset select rendering.
- `demos/linalg-vectors/frontend/src/app/layout.ts` - reusable grid sizing logic.
- `demos/linalg-vectors/frontend/src/app/render-grid.ts` - reusable grid render/update functions.
- `demos/linalg-vectors/frontend/src/app/render-selected.ts` - selected card renderer for image/text datasets.
- `demos/linalg-vectors/frontend/src/app/render-vector.ts` - vector-list renderer for image/text vectors.
- `demos/linalg-vectors/frontend/src/app/sampling.ts` - reusable sampling/cancellation workflow.
- `demos/linalg-vectors/frontend/src/app/text-highlighting.ts` - selected-text token rendering and cross-highlight controller.
- `demos/linalg-vectors/frontend/src/lib/api.ts` - dataset route fetch + runtime validation.
- `demos/linalg-vectors/frontend/src/lib/dataset.ts` - response normalization and image/vector conversion.

## Key Functions/Methods

### Backend

- `backend/main.py::_cors_origins() -> list[str]`
  - Reads `CORS_ALLOW_ORIGINS` and normalizes allowlist.
- `backend/main.py::matrix_apply(payload) -> dict`
  - Validates matrix/vector payload and returns `{"result": number[]}`.
- `backend/main.py::matrix_eig(payload) -> dict`
  - Validates square matrix and returns real-only eigendecomposition.
- `backend/api/routes/datasets.py::datasets() -> dict`
  - Returns dataset catalog response.
- `backend/api/routes/datasets.py::dataset_samples(...) -> dict`
  - Validates query params and delegates to service.
- `backend/services/dataset_sampling.py::sample_dataset_response(...) -> dict`
  - Runs sampling and maps service errors to HTTP errors.
- `backend/services/text_vectorization.py::tokenize_newsgroup_text(text) -> list[str]`
  - Lowercases, removes emails, excludes stop-words and invalid tokens.
- `backend/services/text_vectorization.py::create_20newsgroups_vectorizer(...)`
  - Returns CountVectorizer configured for project token rules.
- `backend/datasets.py::sample_dataset(...) -> dict`
  - Returns JSON-ready sampled image/text payloads.

### Vectors Frontend

- `demos/linalg-vectors/frontend/src/app/state.ts::reducer(state, action) -> AppState`
  - Central app reducer; dedupes appended samples by backend sample index.
- `demos/linalg-vectors/frontend/src/app/state.ts::clampOffset(...)`
  - Keeps vector offset bounded by vector length and `VECTOR_WINDOW`.
- `demos/linalg-vectors/frontend/src/app/dataset-select.ts::renderDatasetOptions(...)`
  - Rebuilds dataset `<select>` only when options/selection signature changes.
- `demos/linalg-vectors/frontend/src/app/view.ts::createAppView(...)`
  - Injects the app shell template and returns typed references to required DOM nodes.
- `demos/linalg-vectors/frontend/src/app/layout-config.ts::getGridGaps(...)`
  - Reads computed grid column/row gaps from CSS to drive sample layout.
- `demos/linalg-vectors/frontend/src/app/layout.ts::computeGridLayout(...)`
  - Computes bounded responsive grid rows/columns and row size.
- `demos/linalg-vectors/frontend/src/app/sampling.ts::createSamplingController(...)`
  - Coordinates append/replace sampling with request cancellation.
- `demos/linalg-vectors/frontend/src/app/sampling.ts::appendSamples(...)`
  - Uses `AbortController`, bounded retries, and state dedupe-safe append path.
- `demos/linalg-vectors/frontend/src/app/sampling.ts::replaceSamples(...)`
  - Cancels in-flight requests, starts new sample request, syncs to target size.
- `demos/linalg-vectors/frontend/src/app/bootstrap.ts::initializeVectorsApp(...)`
  - Executes startup layout measurement, dataset catalog load, and initial sampling.
- `demos/linalg-vectors/frontend/src/app/events.ts::attachAppEventHandlers(...)`
  - Registers UI listeners/observers for selection, scrolling, highlighting, and dataset changes.
- `demos/linalg-vectors/frontend/src/app/render-selected.ts::createSelectedRenderer(...)`
  - Renders selected card content and image vector-window overlay.
- `demos/linalg-vectors/frontend/src/app/render-vector.ts::createVectorRenderer(...)`
  - Renders vector rows for image and text modalities.
- `demos/linalg-vectors/frontend/src/app/text-highlighting.ts::createTextHighlightingController(...)`
  - Owns tokenized selected-text rendering and bidirectional word/vector highlighting.

## Global Parameters / Constants

- `CORS_ALLOW_ORIGINS` - backend CORS allowlist.
- `OPENML_TRAIN_COUNT` (`backend/datasets.py`) - split boundary for OpenML train/test datasets.
- `MAX_DATASET_SAMPLES` (`backend/api/routes/datasets.py`) - query upper bound for sample count.
- `VITE_API_BASE_URL` - frontend API base URL override.
- `VECTOR_WINDOW` (`demos/linalg-vectors/frontend/src/app/constants.ts`) - visible component window size.
- `DATA_ROOT`, `OPENML_DATA_HOME`, `LFW_DATA_HOME`, `NEWSGROUPS_DATA_HOME` - on-disk dataset cache roots.

## Global Objects / Shared State

- `backend/main.py::app` (`FastAPI`)
  - Process-lifetime app instance with middleware/routes.
- `backend/datasets.py::_raw_dataset_cache` and `_split_dataset_cache`
  - Process-lifetime caches for loaded and split dataset views.
- `demos/linalg-vectors/frontend/src/main.ts::state`
  - Browser-lifetime app state (dataset, samples, selection, vector offset, layout, error).

## Data Contracts

- `GET /health`
  - Response: `{"status": "ok"}`
- `GET /api/v1/info`
  - Response: `{"service": string, "version": string}`
- `GET /api/v1/datasets`
  - Response: `{"defaultDataset": string, "datasets": [{"id","displayName","defaultSplit","modality"}]}`
- `GET /api/v1/datasets/samples`
  - Query: `dataset`, `count`, optional `split`, optional `seed`
  - Response:
    - Common: `source`, `displayName`, `split`, `modality`, `imageWidth`, `imageHeight`, `vectorLength`, `totalCount`, `samples`
    - Text modality adds top-level `vocab` and per-sample `rawText`, `snippet`, `wordCounts[]`.
- `POST /api/v1/matrix/apply`
  - Request: `{"matrix": number[][], "vector": number[]}`
  - Response: `{"result": number[]}`
- `POST /api/v1/matrix/eig`
  - Request: `{"matrix": number[][]}`
  - Response: `{"eigenvalues": number[], "eigenvectors": number[][]}`

## External Dependencies

- Backend:
  - `fastapi`, `uvicorn`
  - `numpy`, `scipy`
  - `scikit-learn`
  - `pillow`
- Frontend:
  - `vite`, `typescript`
  - shared modules in `demos/shared`

## Deployment Notes (Render)

- `linalg-backend`
  - `rootDir: backend`
  - build: `pip install -r requirements.txt`
  - start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- `demo-linalg-vectors`
  - `rootDir: .`
  - build: `npm i -g pnpm@10 && pnpm install --frozen-lockfile && pnpm --filter @linalg/demo-vectors build`
  - publish: `demos/linalg-vectors/frontend/dist`
- `demo-linalg-matrix-transforms`
  - `rootDir: .`
  - build: `npm i -g pnpm@10 && pnpm install --frozen-lockfile && pnpm --filter @linalg/demo-matrix-transforms build`
  - publish: `demos/linalg-matrix_transforms/frontend/dist`

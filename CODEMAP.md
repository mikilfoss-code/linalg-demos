<!-- markdownlint-disable -->

# CODEMAP

## Repo Layout

- `backend/` - FastAPI backend for shared API endpoints and dataset sampling.
- `backend/main.py` - API entry module with routing and CORS middleware.
- `backend/mnist_data.py` - Dataset loading, caching, split handling, and sampling.
- `backend/requirements.in` - Direct Python dependencies (source of truth).
- `backend/requirements.txt` - Compiled/pinned Python dependency lockfile.
- `demos/linalg-vectors/frontend/` - Vite + TypeScript vectors demo.
- `demos/linalg-matrix_transforms/frontend/` - Vite + TypeScript matrix demo (currently health-check scaffold).
- `demos/shared/src/lib/` - Shared frontend API/result/type utilities for demos.
- `demos/shared/src/ui/` - Shared demo shell CSS.
- `demos/shared/config/` - Shared Vite and TypeScript base configs for demo frontends.
- `.agent/` - Local agent rules, workflows, and skills.
- `.nvmrc` - Local Node version pin (`25.6.0`).
- `render.yaml` - Render deployment configuration (backend + static demos).
- `AGENT.md` - Repo-specific coding/operation instructions.
- `CODEMAP.md` - This architecture and contract reference.

## Entry Points

### Backend

- File: `backend/main.py`
- Run (dev, repo root): `python -m uvicorn backend.main:app --reload --port 8000`
- Run (Render rootDir=backend): `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Key implemented routes:
  - `GET /health`
  - `GET /api/v1/info`
  - `GET /api/v1/datasets`
  - `GET /api/v1/datasets/samples`
  - `GET /api/v1/mnist/samples` (legacy alias)
  - `POST /api/v1/matrix/apply`
  - `POST /api/v1/matrix/eig`

### Frontend (Per Demo)

- Root: `demos/<demo-name>/frontend/`
- Run: `pnpm dev`
- Build: `pnpm build`
- Entry module: `src/main.ts`

### Tooling / Ops

- Run-local workflow doc: `.agent/workflows/run-local.md`
- Dependency update scan skill doc: `.agent/skills/update-scan/SKILL.md`
- Restart demos skill doc: `.agent/skills/restart-demos/SKILL.md`

## Key Modules And Responsibilities

- `backend/main.py` - FastAPI app setup, CORS policy, dataset/info/health routes, request validation limits.
- `backend/mnist_data.py` - Dataset registry, OpenML/LFW loaders, in-process caches, split slicing, sample serialization.
- `demos/shared/src/lib/api.ts` - Shared API client creation, URL normalization, fetch wrapper, response validators for shared endpoints.
- `demos/shared/src/lib/result.ts` - Standard `Result<T>` error/success wrappers.
- `demos/shared/src/lib/types.ts` - Shared vector/matrix/request types and runtime validators.
- `demos/shared/src/ui/demo-shell.css` - Shared visual shell and tokens for demo pages.
- `demos/linalg-vectors/frontend/src/main.ts` - Vectors demo UI state machine, responsive grid sizing, dataset sampling flow, vector window rendering.
- `demos/linalg-vectors/frontend/src/lib/api.ts` - Vectors demo dataset API validation and calls.
- `demos/linalg-vectors/frontend/src/lib/dataset.ts` - Dataset payload normalization for canvas/vector rendering.
- `demos/linalg-vectors/frontend/src/lib/types.ts` - Demo-specific dataset API response types.
- `demos/linalg-vectors/frontend/src/theme.css` - Vectors demo design/layout tokens.
- `demos/linalg-vectors/frontend/src/style.css` - Vectors demo component and layout styles.
- `demos/linalg-matrix_transforms/frontend/src/main.ts` - Matrix demo scaffold UI + backend health check action.
- `demos/linalg-matrix_transforms/frontend/src/lib/api.ts` - Matrix demo shared API exports.
- `demos/linalg-matrix_transforms/frontend/src/style.css` - Matrix demo local style overrides.
- `demos/*/frontend/vite.config.ts` - Per-demo Vite config (shared alias + backend proxy).
- `demos/shared/config/vite.base.ts` - Shared Vite config factory used by demo wrappers.
- `demos/shared/config/tsconfig.frontend.base.json` - Shared TypeScript compiler baseline for demo frontends.
- `render.yaml` - Render services, env wiring, and build/start commands.

## Key Functions/Methods (Purpose + Contract)

### Backend (`backend/main.py`)

- `_cors_origins() -> list[str]`
  - Inputs: `CORS_ALLOW_ORIGINS` (comma-separated, `"*"` supported).
  - Outputs: normalized allowlist origins.
  - Side effects: reads environment.
  - Errors: none.
- `health() -> dict`
  - Inputs: none.
  - Outputs: `{"status": "ok"}`.
  - Side effects: none.
  - Errors: none.
- `info() -> dict`
  - Inputs: none.
  - Outputs: service metadata (`service`, `version`).
  - Side effects: none.
  - Errors: none.
- `datasets() -> dict`
  - Inputs: none.
  - Outputs: default dataset and available dataset descriptors.
  - Side effects: none.
  - Errors: none.
- `dataset_samples(dataset, count, split, seed) -> dict`
  - Inputs: dataset id, bounded sample count, optional split/seed.
  - Outputs: serialized sample payload from `sample_dataset`.
  - Side effects: may trigger dataset loads/caching via `mnist_data.py`.
  - Errors: converts `ValueError` to HTTP 400.
- `mnist_samples(count, split, seed) -> dict`
  - Inputs: count/split/seed for MNIST.
  - Outputs: backward-compatible alias of dataset sampling.
  - Side effects: same as `dataset_samples`.
  - Errors: converts `ValueError` to HTTP 400.
- `matrix_apply(payload) -> dict`
  - Inputs: matrix/vector request body.
  - Outputs: `{"result": number[]}`.
  - Side effects: none.
  - Errors: HTTP 400 on malformed/non-finite/non-conformant shapes.
- `matrix_eig(payload) -> dict`
  - Inputs: square matrix request body.
  - Outputs: `{"eigenvalues": number[], "eigenvectors": number[][]}` (real-valued only).
  - Side effects: none.
  - Errors: HTTP 400 on malformed input, unsupported complex outputs, or eigendecomposition failures.

### Backend Dataset Engine (`backend/mnist_data.py`)

- `available_datasets() -> list[dict[str, str]]`
  - Inputs: none.
  - Outputs: API-facing dataset metadata list.
  - Side effects: none.
  - Errors: none.
- `sample_dataset(count, dataset, seed, split) -> dict`
  - Inputs: sample count, dataset id, optional seed/split.
  - Outputs: JSON-ready sample payload with grayscale `pixels`.
  - Side effects: random sampling, cache usage, lazy dataset load.
  - Errors: raises `ValueError` on invalid dataset/split or invalid prepared data.
- `get_dataset(dataset, split) -> DatasetView`
  - Inputs: dataset id and optional split.
  - Outputs: cached dataset view including dimensions and labels.
  - Side effects: populates `_raw_dataset_cache` and `_split_dataset_cache` on misses.
  - Errors: raises `ValueError` on invalid dataset/split or malformed source data.
- `_load_openml_square_dataset(source, display_name, openml_name) -> RawDataset`
  - Inputs: OpenML identifiers and display metadata.
  - Outputs: normalized square-image dataset (uint8 images + int labels).
  - Side effects: network/disk IO via `fetch_openml`.
  - Errors: raises on non-square vectors or malformed payload shapes.
- `_load_lfw_dataset() -> RawDataset`
  - Inputs: none.
  - Outputs: normalized LFW dataset.
  - Side effects: network/disk IO via `fetch_lfw_people`.
  - Errors: raises on malformed source data.

### Shared Frontend Library (`demos/shared/src/lib`)

- `getApiBaseUrl() -> string` (`api.ts`)
  - Inputs: `VITE_API_BASE_URL`, Vite `DEV` flag.
  - Outputs: normalized base URL; same-origin in dev when unset.
  - Side effects: reads environment.
  - Errors: none.
- `createApiClient(baseUrl?) -> ApiClient` (`api.ts`)
  - Inputs: optional base URL override.
  - Outputs: API client with `requestJson`.
  - Side effects: none.
  - Errors: runtime failures surfaced through `Result`.
- `createApi({ baseUrl?, client?, features? }) -> ApiService` (`api.ts`)
  - Inputs: optional client/base URL and feature flags.
  - Outputs: typed API service (health/matrix/eigen as enabled).
  - Side effects: none.
  - Errors: validation/network errors surfaced through `Result`.
- `ok(value)`, `fail(error)`, `buildError(...)` (`result.ts`)
  - Inputs: values/errors.
  - Outputs: `Result<T>` and structured API errors.
  - Side effects: none.
  - Errors: none.
- `isVec`, `isMat`, `assert`, and scalar guards (`types.ts`)
  - Inputs: unknown values.
  - Outputs: runtime validation/type narrowing.
  - Side effects: none.
  - Errors: `assert` throws when false.

### Demo: `linalg-vectors` (`demos/linalg-vectors/frontend`)

- `listDatasets() -> Promise<Result<DatasetsResponse>>` (`src/lib/api.ts`)
  - Inputs: none.
  - Outputs: backend dataset catalog (`defaultDataset` + dataset options).
  - Side effects: `GET /api/v1/datasets`.
  - Errors: returns `Result.ok=false` on network/HTTP/validation failures.
- `datasetSamples(dataset, count, seed?, split?) -> Promise<Result<DatasetSamplesResponse>>` (`src/lib/api.ts`)
  - Inputs: dataset id, count, optional seed/split.
  - Outputs: validated dataset sample response.
  - Side effects: `GET /api/v1/datasets/samples`.
  - Errors: returns `Result.ok=false` on invalid input/network/HTTP/validation failures.
- `loadDatasetSamples(dataset, count, seed?) -> Promise<Result<DatasetSampleSet>>` (`src/lib/dataset.ts`)
  - Inputs: dataset id, count, optional seed.
  - Outputs: normalized metadata + converted sample buffers, including frontend-derived normalized vectors.
  - Side effects: calls `datasetSamples`.
  - Errors: propagates failures as `Result.ok=false`.
- `toImageData(sample, imageWidth, imageHeight) -> ImageData` (`src/lib/dataset.ts`)
  - Inputs: normalized sample + dimensions.
  - Outputs: `ImageData` for canvas rendering.
  - Side effects: none.
  - Errors: none.
- `reducer(state, action) -> AppState` (`src/main.ts`)
  - Inputs: current app state and action union.
  - Outputs: next immutable state.
  - Side effects: none.
  - Errors: none.
- `computeGridLayout(width, height, columnGap, rowGap) -> { layout, rowSize }` (`src/main.ts`)
  - Inputs: measured width/height and CSS gap values.
  - Outputs: bounded responsive grid rows/columns plus row size.
  - Side effects: none.
  - Errors: none.
- `syncSamplesToTarget(targetCount) -> void` (`src/main.ts`)
  - Inputs: desired sample count for current layout.
  - Outputs: none.
  - Side effects: trims local samples or triggers async append fetches.
  - Errors: failures surfaced via state `error`.
- `drawVectorWindowOutline(...) -> void` (`src/main.ts`)
  - Inputs: canvas context, image/display dimensions, vector window range.
  - Outputs: highlighted rectangle segments over selected image.
  - Side effects: draws on canvas.
  - Errors: safely no-op on invalid dimensions/ranges.

### Demo: `linalg-matrix_transforms` (`demos/linalg-matrix_transforms/frontend`)

- `health() -> Promise<Result<HealthResponse>>` (`src/lib/api.ts`, shared export wiring)
  - Inputs: none.
  - Outputs: backend health response.
  - Side effects: HTTP request.
  - Errors: returned via `Result.ok=false`.
- Button click handler in `src/main.ts`
  - Inputs: user click.
  - Outputs: renders health response/error text.
  - Side effects: updates DOM, calls `health`.
  - Errors: displays API failure message.

## Global Parameters / Constants

- `CORS_ALLOW_ORIGINS` (backend env)
  - Affects: allowed origins in CORS middleware.
  - Used in: `backend/main.py::_cors_origins`.
- `MAX_DATASET_SAMPLES` (backend constant, currently `64`)
  - Affects: upper bound for sample count query params.
  - Used in: `backend/main.py` query validators.
- `DATA_ROOT`, `OPENML_DATA_HOME`, `LFW_DATA_HOME` (backend constants)
  - Affects: on-disk dataset cache locations.
  - Used in: `backend/mnist_data.py`.
- `OPENML_TRAIN_COUNT` (backend constant, `60000`)
  - Affects: train/test split boundary for OpenML datasets.
  - Used in: `backend/mnist_data.py::_slice_for_split`.
- `VITE_API_BASE_URL` (frontend env)
  - Affects: backend URL selection for demo API clients.
  - Used in: `demos/shared/src/lib/api.ts::getApiBaseUrl`.
- `DATASET_SAMPLES_ENDPOINT` (vectors frontend constant)
  - Affects: debug display of dataset endpoint path.
  - Used in: `demos/linalg-vectors/frontend/src/lib/dataset.ts`, `demos/linalg-vectors/frontend/src/main.ts`.
- `VECTOR_WINDOW` (vectors frontend constant, `10`)
  - Affects: vector component window size for slider/list and selected-image outline.
  - Used in: `demos/linalg-vectors/frontend/src/main.ts`.
- CSS variables (`--grid-*`, `--layout-*`, `--vector-*`, etc.)
  - Affects: vectors demo responsive layout and rendering behavior.
  - Used in: `demos/linalg-vectors/frontend/src/theme.css`, `demos/linalg-vectors/frontend/src/style.css`, `demos/linalg-vectors/frontend/src/main.ts`.
- `PORT`, `PYTHON_VERSION`, `NODE_VERSION`, `RENDER_EXTERNAL_URL` (Render env/config)
  - Affects: deployment runtime versions, backend binding, and frontend API base URL binding.
  - Used in: `render.yaml`.

## Global Objects / Shared State

- `app` (`FastAPI` instance, `backend/main.py`)
  - Contains: middleware and route registrations.
  - Owner/lifetime: module-global, process lifetime.
  - Invariants: CORS middleware initialized before request handling.
- `_raw_dataset_cache` / `_split_dataset_cache` (`backend/mnist_data.py`)
  - Contains: loaded raw datasets and split-specific dataset views.
  - Owner/lifetime: module-global, process lifetime.
  - Invariants: cache keys map to normalized dataset views by source + split.
- `state` (`AppState`, vectors demo `src/main.ts`)
  - Contains: loading status, selected dataset, metadata, samples, selection, vector offset, grid layout, target sample count, error text.
  - Owner/lifetime: module-local singleton, browser session lifetime.
  - Invariants: selected index remains in bounds; vector offset stays clamped to selected vector length; sample count syncs toward grid target.

## Data Contracts

- `GET /health`
  - Response: `{"status": string}`
  - Errors: non-2xx surfaced as `Result.ok=false` in clients.
- `GET /api/v1/info`
  - Response: `{"service": string, "version": string}`
  - Errors: non-2xx surfaced as `Result.ok=false`.
- `GET /api/v1/datasets`
  - Response: `{"defaultDataset": string, "datasets": [{"id": string, "displayName": string, "defaultSplit": string}]}`
  - Errors: non-2xx surfaced as client error results.
- `GET /api/v1/datasets/samples`
  - Query: `dataset`, `count`, optional `split`, optional `seed`.
  - Response: `{"source","displayName","split","imageWidth","imageHeight","totalCount","samples":[{index,label,labelName?,pixels}]}`
  - Notes: `pixels` are grayscale bytes (`0..255`); vectors are derived in the frontend.
  - Errors: HTTP 400 for invalid dataset/split; 5xx for loader/IO failures.
- `GET /api/v1/mnist/samples` (legacy alias)
  - Query: `count`, `split`, optional `seed`.
  - Response: same shape as `datasets/samples` with dataset fixed to MNIST.
  - Errors: HTTP 400 on invalid split; 5xx on loader/IO failures.
- `POST /api/v1/matrix/apply`
  - Request: `{"matrix": number[][], "vector": number[]}`.
  - Response: `{"result": number[]}`.
  - Errors: HTTP 400 on invalid dimensions/types/non-finite values.
- `POST /api/v1/matrix/eig`
  - Request: `{"matrix": number[][]}`.
  - Response: `{"eigenvalues": number[], "eigenvectors": number[][]}`.
  - Errors: HTTP 400 on invalid input, non-square matrices, unsupported complex results, or decomposition failures.

## External Dependencies

- Backend:
  - `fastapi`, `uvicorn`
  - `numpy`, `scipy`
  - `scikit-learn` dataset fetchers (`fetch_openml`, `fetch_lfw_people`)
  - `pillow`
- Frontend:
  - Vite + TypeScript
  - Shared API/type utilities under `demos/shared`
  - Google Fonts (`Space Grotesk`, `IBM Plex Mono`)

## Deployment Notes (Render)

- Services:
  - `linalg-backend` (Python web service, `rootDir: backend`)
  - `demo-linalg-vectors` (static site)
  - `demo-linalg-matrix-transforms` (static site)
- Build/start:
  - Backend build: `pip install -r requirements.txt`
  - Backend start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
  - Demos build: `npm i -g pnpm@10 && pnpm install --frozen-lockfile && pnpm build`
  - Static publish path: `dist`
- Demo routing:
  - Each static demo rewrites `/*` to `/index.html`.

<!-- markdownlint-disable -->

# CODEMAP

## Repo layout

- backend/ - FastAPI backend serving shared API endpoints.
- demos/linalg-vectors/frontend/ - Vite + TypeScript demo site for vectors.
- demos/linalg-matrix_transforms/frontend/ - Vite + TypeScript demo site for matrix transforms.
- demos/shared/ - Shared frontend helper modules for demos.
- render.yaml - Render deployment configuration for backend + static demos.
- AGENTS.md - repo-specific agent instructions.
- CODEMAP.md - this document.

## Entry points

### Backend

- File: backend/main.py
- Run (dev): uvicorn main:app --reload --port 8000
- Run (prod): uvicorn main:app --host 0.0.0.0 --port $PORT
- Key routes:
  - GET /health
  - GET /api/v1/info
  - GET /api/v1/mnist/samples

### Frontend (per demo)

- Root: demos/<demo-name>/frontend/
- Run (dev): pnpm dev
- Build: pnpm build
- Entry module: src/main.ts

## Key modules and responsibilities

- backend/main.py - FastAPI app, CORS configuration, and health/info endpoints.
- demos/linalg-vectors/frontend/src/main.ts - MNIST vector explorer UI entry with debug panel and vector window highlighting.
- demos/linalg-matrix_transforms/frontend/src/main.ts - Matrix transforms demo entry (currently basic health check UI).
- demos/linalg-vectors/frontend/src/lib/mnist.ts - Fetches MNIST samples from the backend and converts them for canvas rendering.
- backend/mnist_data.py - Downloads MNIST files, caches datasets, and serves sampled vectors.
- demos/\*/frontend/src/lib/api.ts - API client helpers, base URL selection, fetch wrapper, and response validation.
- demos/\*/frontend/vite.config.ts - Vite dev server config with backend API proxying and @shared alias wiring.
- demos/shared/src/lib/result.ts - Shared Result helpers for API responses.
- demos/shared/src/lib/types.ts - Shared types (Vec/Mat) and runtime validators.
- demos/linalg-vectors/frontend/src/lib/types.ts - MNIST-specific API types that re-export shared validators.
- demos/\*/frontend/src/style.css - Demo-level styling.
- render.yaml - Render service definitions and env wiring for backend + demo sites.

## Key functions/methods (purpose + contract)

- \_cors_origins() -> list[str] (backend/main.py)
  - Inputs: env CORS_ALLOW_ORIGINS (comma-separated origins, "\*" allowed).
  - Outputs: list of allowed origins.
  - Side effects: reads environment.
  - Error cases: none; defaults to ["*"].
- health() -> {"status": str} (backend/main.py)
  - Inputs: none.
  - Outputs: status string.
  - Side effects: none.
  - Error cases: none.
- info() -> {"service": str, "version": str} (backend/main.py)
  - Inputs: none.
  - Outputs: service name and app version.
  - Side effects: none.
  - Error cases: none.

- getApiBaseUrl() -> string (demos/\*/frontend/src/lib/api.ts)
  - Inputs: env VITE_API_BASE_URL (optional).
  - Outputs: normalized base URL with trailing slashes removed; defaults to same-origin in dev when unset.
  - Side effects: reads environment.
  - Error cases: none; non-dev fallback is http://localhost:8000.
- requestJson<T>(path, init, validate?) -> Promise<Result<T>> (demos/\*/frontend/src/lib/api.ts)
  - Inputs: request path, fetch options, optional validator.
  - Outputs: parsed JSON (validated when provided).
  - Side effects: performs network request.
  - Error cases: returns Result.ok=false on network, non-2xx, or validation errors.
- health() -> Promise<Result<HealthResponse>> (demos/\*/frontend/src/lib/api.ts)
  - Inputs: none.
  - Outputs: {status: string}.
  - Side effects: GET /health request.
  - Error cases: Result.ok=false on non-2xx or validation errors.
- matrixApply(req: {matrix: Mat, vector: Vec}) -> Promise<Result<{result: Vec}>>
  - Inputs: matrix and vector arrays of finite numbers.
  - Outputs: result vector.
  - Side effects: POST /api/v1/matrix/apply request.
  - Error cases: Result.ok=false on invalid input, non-2xx, or validation errors.
- eigen(req: {matrix: Mat}) -> Promise<Result<{eigenvalues: number[], eigenvectors: Mat}>>
  - Inputs: matrix array of finite numbers.
  - Outputs: eigenvalues list and eigenvectors matrix (columns).
  - Side effects: POST /api/v1/matrix/eig request.
  - Error cases: Result.ok=false on invalid input, non-2xx, or validation errors.
- mnistSamples(count, seed?, split?) -> Promise<Result<MnistSamplesResponse>> (demos/linalg-vectors/frontend/src/lib/api.ts)
  - Inputs: sample count, optional seed, and split ("train"|"test").
  - Outputs: MNIST samples with metadata from the backend.
  - Side effects: GET /api/v1/mnist/samples request.
  - Error cases: Result.ok=false on invalid input, non-2xx, or validation errors.
- isVec/isMat/assert(...) (demos/shared/src/lib/types.ts)
  - Inputs: unknown values.
  - Outputs: boolean type guards; assert throws on false.
  - Side effects: none.
  - Error cases: assert throws Error.
- loadMnistSamples(count, seed?) -> Result<MnistSampleSet> (demos/linalg-vectors/frontend/src/lib/mnist.ts)
  - Inputs: desired sample count and optional RNG seed.
  - Outputs: metadata and converted MNIST samples for rendering.
  - Side effects: fetches MNIST samples from the backend.
  - Error cases: Result.ok=false on backend or validation failures.
- toImageData(sample, size) -> ImageData (demos/linalg-vectors/frontend/src/lib/mnist.ts)
  - Inputs: MNIST sample and tile size.
  - Outputs: ImageData for canvas rendering.
  - Side effects: none.
  - Error cases: none.
- sample_mnist(count, seed, split) -> dict (backend/mnist_data.py)
  - Inputs: sample count, optional seed, and split.
  - Outputs: JSON payload with pixels, vectors, and metadata.
  - Side effects: loads/decodes MNIST files and samples with numpy RNG.
  - Error cases: raises on invalid split or IO failures.
- get_dataset(split) -> MnistDataset (backend/mnist_data.py)
  - Inputs: dataset split ("train" or "test").
  - Outputs: cached MNIST dataset arrays and metadata.
  - Side effects: downloads and parses MNIST gzip files on first use.
  - Error cases: raises on IO or parsing failures.
- reducer(state, action) -> AppState (demos/linalg-vectors/frontend/src/main.ts)
  - Inputs: current UI state and action.
  - Outputs: next UI state.
  - Side effects: none (pure state transition).
  - Error cases: none.
- drawVectorWindowOutline(ctx, size, offset, windowSize, vectorLength) -> void (demos/linalg-vectors/frontend/src/main.ts)
  - Inputs: canvas context, image size, vector window offset, window size, vector length.
  - Outputs: draws a border outline for pixels mapped to the current vector window.
  - Side effects: draws on the selected digit canvas.
  - Error cases: none.

## Global parameters / constants

- CORS_ALLOW_ORIGINS (backend)
  - Affects: allowed origins in CORS middleware.
  - Used in: backend/main.py::\_cors_origins.
- VITE_API_BASE_URL (frontend)
  - Affects: API base URL used by demo clients; dev builds use same-origin when unset.
  - Used in: demos/\*/frontend/src/lib/api.ts::getApiBaseUrl.
- MNIST_ENDPOINT (frontend)
  - Affects: backend path used for MNIST sampling requests.
  - Used in: demos/linalg-vectors/frontend/src/lib/mnist.ts.
- MNIST_BASE_URL (backend)
  - Affects: remote base URL for MNIST gzip downloads.
  - Used in: backend/mnist_data.py.
- DATA_DIR (backend)
  - Affects: local cache location for MNIST gzip files.
  - Used in: backend/mnist_data.py.
- MAX_MNIST_SAMPLES (backend)
  - Affects: request limit for /api/v1/mnist/samples.
  - Used in: backend/main.py.
- SAMPLE_COUNT (frontend)
  - Affects: number of MNIST images shown in the grid.
  - Used in: demos/linalg-vectors/frontend/src/main.ts.
- VECTOR_WINDOW (frontend)
  - Affects: number of vector components shown at once.
  - Used in: demos/linalg-vectors/frontend/src/main.ts.
- PORT (Render)
  - Affects: backend bind port in prod.
  - Used in: render.yaml backend startCommand.
- PYTHON_VERSION (Render)
  - Affects: backend runtime version.
  - Used in: render.yaml.
- NODE_VERSION (Render)
  - Affects: demo build/runtime environment.
  - Used in: render.yaml.
- RENDER_EXTERNAL_URL (Render-provided)
  - Affects: frontends' VITE_API_BASE_URL via Render service binding.
  - Used in: render.yaml envVars for demo services.

## Global objects / shared state

- app (FastAPI instance, backend/main.py)
  - Contains: route registrations and middleware.
  - Owner/lifetime: module-global; lives for process lifetime.
  - Invariants: CORS middleware is applied before serving requests.
- state (vectors frontend, demos/linalg-vectors/frontend/src/main.ts)
  - Contains: loading status, MNIST metadata, sampled images, selected index, vector offset, last error message.
  - Owner/lifetime: module-local; lives for the browser session.
  - Invariants: selectedId references samples; vectorOffset stays within vector bounds.
- _dataset_cache (backend, backend/mnist_data.py)
  - Contains: cached MNIST datasets by split.
  - Owner/lifetime: module-global; lives for process lifetime.
  - Invariants: cached datasets match their declared split.

## Data contracts

- GET /health
  - Response: {"status": string}
  - Errors: non-2xx surfaced in Result.ok=false.
- GET /api/v1/info
  - Response: {"service": string, "version": string}
  - Errors: non-2xx surfaced in Result.ok=false.
- POST /api/v1/matrix/apply (frontend-defined contract)
  - Request: {"matrix": number[][], "vector": number[]}
  - Response: {"result": number[]}
  - Errors: client validates input/output; Result.ok=false on non-2xx.
- POST /api/v1/matrix/eig (frontend-defined contract)
  - Request: {"matrix": number[][]}
  - Response: {"eigenvalues": number[], "eigenvectors": number[][]}
  - Errors: client validates input/output; Result.ok=false on non-2xx.
- GET /api/v1/mnist/samples
  - Request (query): count (int), split ("train"|"test"), seed (int, optional).
  - Response: {"source": str, "split": str, "imageSize": int, "totalCount": int, "samples": [{index, label, pixels, vector}]}
  - Notes: pixels are 0..255 grayscale; vector is normalized 0..1.
  - Errors: 400 on invalid split; 5xx on IO/parsing failures.
- MNIST sample (frontend)
  - Shape: {index: number, label: number, bytes: Uint8ClampedArray<ArrayBuffer>, vector: Float32Array}
  - Usage: image bytes render the canvas tile; vector powers the component window.

## External dependencies

- Backend: FastAPI + CORS middleware; downloads MNIST gzip files from Google storage.
- Frontend: Vite + TypeScript build pipeline; Google Fonts.

## Deployment notes (Render)

- Services:
  - linalg-backend (python web service)
  - demo-linalg-vectors (static site)
  - demo-linalg-matrix-transformations (static site)
- rootDir mapping:
  - backend -> backend/
  - demo-linalg-vectors -> demos/linalg-vectors/frontend
  - demo-linalg-matrix-transformations -> demos/linalg-matrix_transformations/frontend
- Build/start commands:
  - backend: pip install -r requirements.txt; uvicorn main:app --host 0.0.0.0 --port $PORT
  - demos: npm i -g pnpm@10; pnpm install --frozen-lockfile; pnpm build; publish dist/

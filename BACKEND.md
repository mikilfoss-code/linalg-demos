# Backend Reference

This document describes the backend service in `backend/`:
entrypoints, modules, contracts, invariants, and stateful objects.

## Overview

- Framework: FastAPI
- Entry module: `backend/main.py`
- Primary responsibilities:
  - health/info service metadata endpoints
  - matrix application and eigendecomposition endpoints
  - Markov-chain analysis endpoint
  - dataset catalog and sampling endpoints for frontends

## Structure

```text
backend/
  main.py
  datasets.py
  api/routes/datasets.py
  services/dataset_sampling.py
  services/text_vectorization.py
  tests/
```

## Entrypoints

- App object: `backend/main.py::app`
- Local run command (repo root):
  - `python -m uvicorn backend.main:app --reload --port 8000`
- Render/backend-root run command:
  - `uvicorn main:app --host 0.0.0.0 --port $PORT`

## Endpoint Ownership

- Route: `/health`; Method: `GET`; Owner module: `backend/main.py`; Purpose: liveness.
- Route: `/api/v1/info`; Method: `GET`; Owner module: `backend/main.py`; Purpose: service metadata.
- Route: `/api/v1/datasets`; Method: `GET`; Owner module: `backend/api/routes/datasets.py`; Purpose: dataset catalog.
- Route: `/api/v1/datasets/samples`; Method: `GET`; Owner module: `backend/api/routes/datasets.py`; Purpose: dataset sampling.
- Route: `/api/v1/matrix/apply`; Method: `POST`; Owner module: `backend/main.py`; Purpose: matrix-vector multiplication.
- Route: `/api/v1/matrix/eig`; Method: `POST`; Owner module: `backend/main.py`; Purpose: real eigendecomposition.
- Route: `/api/v1/markov/analyze`; Method: `POST`; Owner module: `backend/main.py`; Purpose: Markov diagnostics.

## Request/Response Contracts

### `GET /health`

- Response: `{"status": "ok"}`

### `GET /api/v1/info`

- Response: `{"service": string, "version": string}`

### `GET /api/v1/datasets`

- Response:
  - `defaultDataset: string`
  - `datasets: [{id, displayName, defaultSplit, modality}]`

### `GET /api/v1/datasets/samples`

- Query:
  - `dataset: string` (default `mnist`)
  - `count: int` (`1..MAX_DATASET_SAMPLES`, default `24`)
  - `split?: train|test|all`
  - `seed?: int >= 0`
- Response common:
  - `source`, `displayName`, `split`, `modality`
  - `imageWidth`, `imageHeight`, `vectorLength`, `totalCount`
  - `samples`
- Text responses additionally include:
  - top-level `vocab`
  - sample fields `rawText`, `snippet`, `wordCounts[]`

### `POST /api/v1/matrix/apply`

- Request: `{"matrix": number[][], "vector": number[]}`
- Response: `{"result": number[]}`

### `POST /api/v1/matrix/eig`

- Request: `{"matrix": number[][]}`
- Response: `{"eigenvalues": number[], "eigenvectors": number[][]}`
- Note: complex eigensystems are rejected with HTTP 400.

### `POST /api/v1/markov/analyze`

- Request:
  - `transitionMatrix: number[][]`
  - `initialVector: number[]`
  - `currentVector: number[]`
- Response:
  - `isRowStochastic: boolean`
  - `rowSums: number[]`
  - `nextVector: number[]`
  - `stationaryDistribution: number[]`
  - `stationaryResidual: number`
  - `spectralGap: number | null`
  - `eigenvalues: [{real, imag, magnitude}]`

## Validation Invariants

### Matrix/Vector Core

- All matrix/vector payloads must be finite numeric arrays.
- Matrices must be rectangular.
- Vector lengths must match matrix dimensions where required.

### Markov Endpoint

- `transitionMatrix` must be square.
- `transitionMatrix` entries must be non-negative.
- Every row of `transitionMatrix` must sum to 1 within tolerance.
- `initialVector` and `currentVector` must be non-negative and sum to 1.
- Markov stepping uses row-vector convention: `x_(t+1) = x_t P`.

### Dataset Sampling

- `count` is constrained by route-level query validation.
- `dataset` must map to a registered spec in `DATASET_SPECS`.
- `split` rules are dataset-aware (`train/test` allowed only where supported).

## Error Mapping Policy

- Input/contract violations: HTTP 400.
- Unexpected dataset service failures: HTTP 500 from
  `services/dataset_sampling.py`, with contextual message.
- Network-layer format is consistent with FastAPI `HTTPException.detail`.

## Global Parameters / Constants

- `CORS_ALLOW_ORIGINS` (env var): CORS allowlist source.
- `PROBABILITY_TOLERANCE` (`backend/main.py`): Markov probability tolerance.
- `MAX_DATASET_SAMPLES` (`backend/api/routes/datasets.py`): upper bound for
  sample query count.
- `OPENML_TRAIN_COUNT` (`backend/datasets.py`): split boundary for OpenML
  datasets.
- `DATA_ROOT`, `OPENML_DATA_HOME`, `LFW_DATA_HOME`, `NEWSGROUPS_DATA_HOME`
  (`backend/datasets.py`): on-disk data cache paths.

## Global Objects / Shared State

- `app` (`FastAPI`) in `backend/main.py`.
- Dataset caches in `backend/datasets.py`:
  - `_raw_dataset_cache`
  - `_split_dataset_cache`
  - guarded by `_cache_lock`

## Key Modules And Responsibilities

- `backend/main.py`
  - app construction, CORS middleware, core matrix/Markov endpoints
  - payload validation utilities and numeric analysis helpers
- `backend/datasets.py`
  - dataset registry/specs and split-aware cached views
  - sample serialization for image and text modalities
- `backend/api/routes/datasets.py`
  - request-level query validation
  - route surface for dataset catalog and sampling
- `backend/services/dataset_sampling.py`
  - service wrapper and exception normalization to HTTP errors
- `backend/services/text_vectorization.py`
  - token filtering and vectorizer construction policy for 20 Newsgroups

## Dependencies

Runtime (`backend/requirements.in`):

- `fastapi`, `uvicorn[standard]`, `python-multipart`
- `numpy`, `scipy`
- `scikit-learn`
- `pillow`

Dev/test (`backend/requirements-dev.in`):

- `-r requirements.in`
- `pytest`

## Tests

- `backend/tests/test_dataset_sampling_service.py`
- `backend/tests/test_markov_analysis.py`
- `backend/tests/test_text_vectorization.py`

Current tests focus on service error mapping, Markov contract validation, and
text tokenization/vectorization policy behavior.

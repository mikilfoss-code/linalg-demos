# linalg-demos

Interactive teaching demos for linear algebra concepts, backed by a shared
FastAPI service and organized as a pnpm monorepo.

## What Is In This Repo

- `backend/`: shared Python API for matrix operations, Markov analysis, and
  dataset catalog/sampling.
- `demos/linalg-vectors/frontend/`: image/text vector exploration demo.
- `demos/linalg-matrix_transforms/frontend/`: matrix-transform shell demo.
- `demos/linalg-markov_chains/frontend/`: Markov chain editor/simulator demo.
- `demos/linalg-networks/frontend/`: incidence matrix, flow, and vector-space
  exploration demo for directed graphs.
- `demos/shared/`: shared frontend runtime modules and base UI tokens.

## Documentation Map

- `CODEMAP.md`: canonical global code map, shared constants, contracts, and
  deployment notes.
- `LAYOUT.md`: canonical schema-driven layout engine documentation.
- `BACKEND.md`: backend-focused architecture and API contract reference.
- `DEMO-VECTORS.md`: vectors demo architecture, state, tokens, and contracts.
- `DEMO-MATRIX_TRANSFORMATIONS.md`: matrix demo architecture and contracts.
- `DEMO-MARKOV_CHAINS.md`: Markov demo architecture and state contracts.
- `DEMO-NETWORKS.md`: networks demo architecture, state, and linear algebra
  contracts.
- `AGENT.md`: repo editing/authorization/documentation maintenance contract.

## Repository Structure

```text
backend/
  api/routes/datasets.py
  services/
  datasets.py
  main.py
demos/
  shared/
    config/
    src/lib/
    src/ui/
  linalg-vectors/frontend/
  linalg-matrix_transforms/frontend/
  linalg-markov_chains/frontend/
  linalg-networks/frontend/
.agent/
  rules/
CODEMAP.md
LAYOUT.md
BACKEND.md
DEMO-VECTORS.md
DEMO-MATRIX_TRANSFORMATIONS.md
DEMO-MARKOV_CHAINS.md
DEMO-NETWORKS.md
```

## Local Development

### Prerequisites

- Python with shared virtual environment:
  `C:\Users\mfoss3\.venvs\linalg-demos`
- Node `25.x` and pnpm `10.x` (see root `package.json` Volta pins).

### Backend

From repo root:

```bash
python -m uvicorn backend.main:app --reload --port 8000
```

### Frontend (Workspace-Preferred)

From repo root:

```bash
pnpm dev:vectors
pnpm dev:matrix
pnpm dev:markov
pnpm dev:networks
```

Per-demo commands are also available in each `demos/<demo>/frontend` folder:
`pnpm dev`, `pnpm build`, `pnpm preview`.

## Build And Typecheck

From repo root:

```bash
pnpm build
pnpm build:networks
pnpm typecheck
```

## Runtime Endpoint Surface

Backend routes currently exposed:

- `GET /health`
- `GET /api/v1/info`
- `GET /api/v1/datasets`
- `GET /api/v1/datasets/samples`
- `POST /api/v1/matrix/apply`
- `POST /api/v1/matrix/eig`
- `POST /api/v1/markov/analyze`

## Deployment Snapshot

`render.yaml` currently defines:

- `linalg-backend`
- `demo-linalg-vectors`
- `demo-linalg-matrix-transforms`

Markov frontend has a local build target but is not currently defined as a
Render static service. Networks frontend is also local-only at this time.

## Documentation Maintenance Rule

When code structure/contracts/state/tokens change, update the relevant docs in
the same change set:

- `CODEMAP.md`
- `LAYOUT.md`
- `BACKEND.md`
- `DEMO-*.md` for affected demos

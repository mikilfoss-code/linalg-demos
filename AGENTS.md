## linalg-demos (monorepo)

## Repo description
- Teaching-oriented interactive linear algebra demos (Three.js frontends) + one shared Python API backend.
- Students will have access to the webapps but not the code.

## Directory rules
- Backend: `backend/`
- Demos: `demos/<demo-name>/frontend/`
- Do not create per-demo Python venvs.

## Python (shared venv)
- Shared venv path: `C:\Users\mfoss3\.venvs\linalg-demos`
- Install backend deps: `pip install -r backend\requirements.txt`
- Run backend (from backend/): `uvicorn main:app --reload --port 8000`

## Frontend (per-demo)
- From `demos/<demo-name>/frontend/`:
  - `pnpm install`
  - `pnpm dev`
  - `pnpm build`

## Conventions
- Keep demos classroom-friendly.
- When adding dependencies, explain why.

## Documentation contract (required)
- `CODEMAP.md` at the repo root is the canonical code-structure overview.
- Update `CODEMAP.md` in the same PR/change set whenever you:
  - add/remove/rename files, modules, directories, routes, endpoints, scripts
  - change key functions/methods or their contracts
  - change global parameters/constants/env vars and what they affect
  - change global/shared objects/state (fields, lifecycle, invariants)
  - change data schemas/contracts (JSON, request/response shapes)
  - add suggestions for future improvements to enhance the effectiveness of the demos as a teaching tool, reduce code redundance, and improve overall performance
- If no structural/contract/global changes occurred, explicitly state: “No CODEMAP update needed.”


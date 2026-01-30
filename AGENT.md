# linalg-demos (monorepo)

## Repo description

- Teaching-oriented interactive linear algebra demos (Three.js frontends) + one shared Python API backend.
- Students will have access to the webapps but not the code.

## Comments and Code Documentation

- Provide clear, concise, and helpful comments for non-obvious logic or public interfaces.
- Use JSDoc strictly for intent and behavior: document @param logic, @returns context, expected @throws conditions, and any side effects.
- Never redeclare TypeScript types inside JSDoc tags.
- Use Python docstrings for Python code.

## Directory rules

- Backend: `backend/`
- Demos: `demos/<demo-name>/frontend/`
- Do not create per-demo Python venvs.

## Python execution policy (required)

- Shared venv path: `C:\Users\mfoss3\.venvs\linalg-demos`
- Install backend deps: `pip install -r backend\requirements.txt`
- Before running any Python command for the backend, verify the interpreter:
  - Run: `python -c "import sys,os; print(sys.executable); print(os.environ.get('VIRTUAL_ENV'))"`
  - It MUST point to `C:\Users\mfoss3\.venvs\linalg-demos`.
- If not, activate the shared venv at `C:\Users\mfoss3\.venvs\linalg-demos` and re-run the check.
- Never install Python packages unless the venv check passes.
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
  - if structurally significant changes occurred, add suggestions for reducing code redundancy, and improving overall performance
- If no structural/contract/global changes occurred, explicitly state: “No CODEMAP update needed.”

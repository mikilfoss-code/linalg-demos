---
description: 'Run backend + one chosen demo locally (Windows PowerShell)'
---

# Run Backend and One Demo Locally

1. Backend:

- Activate venv: `C:\Users\mfoss3\.venvs\linalg-demos\Scripts\Activate.ps1`
- From repo root, install deps from `requirements.in` workflow if needed:
  - `uv pip compile backend/requirements.in -o backend/requirements.txt`
  - `uv pip sync backend/requirements.txt`
  - fallback: `python -m pip install -r backend/requirements.in`
- Run from repo root: `python -m uvicorn backend.main:app --reload --port 8000`

1. Frontend (ask which demo):

- `cd demos/{demo-name}/frontend`
- pnpm install
- pnpm dev --port 5173

Confirm:

- backend /health returns OK
- frontend loads and can call the backend base URL

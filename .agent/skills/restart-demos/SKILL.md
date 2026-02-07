---
name: restart-demos
description: Restart local dev servers for the linalg monorepo on Windows. Starts FastAPI/Uvicorn backend (8000) and a chosen demo frontend (Vite/pnpm, 5173). Uses the shared venv at C:\Users\mfoss3\.venvs\linalg-demos.
---

# Restart a local linalg demo (Windows)

## Inputs

- demo name (required). Example: `linalg-vectors`. If missing, default to `linalg-vectors`.

## Hard constraints

- Work only inside this repository root.
- Do NOT create per-demo Python venvs.
- Always use the shared venv: `C:\Users\mfoss3\.venvs\linalg-demos`
- Do NOT install Python packages globally or into user-site.
- Use `pnpm` (not npm) for frontend.
- Do NOT kill processes on ports 8000/5173 without asking first.

## Procedure

### A) Validate repo + demo

1. Confirm repo root has `backend/` and `demos/`.
2. Confirm demo frontend exists: `demos/<demo>/frontend/`. If missing, stop and report the missing path.

### B) Backend (port 8000)

1. Activate the shared venv:
   - `& "$env:USERPROFILE\.venvs\linalg-demos\Scripts\Activate.ps1"`

2. Verify the interpreter points to the shared venv:
   - `python -c "import sys,os; print(sys.executable); print(os.environ.get('VIRTUAL_ENV'))"`
   - It MUST point to `C:\Users\mfoss3\.venvs\linalg-demos`
   - If not, stop and report.

3. Ensure backend deps are present (run only if needed) using the `requirements.in` workflow:
   - `uv pip compile backend/requirements.in -o backend/requirements.txt`
   - `uv pip sync backend/requirements.txt`
   - Fallback: `python -m pip install -r backend/requirements.in`

4. If port 8000 is already in use:
   - `powershell -ExecutionPolicy Bypass -File .agent\skills\restart-demos\scripts\who-owns-port.ps1 -Port 8000`
   - Ask user whether to stop the owning process. If approved:
     - `powershell -ExecutionPolicy Bypass -File .agent\skills\restart-demos\scripts\stop-port.ps1 -Port 8000 -Force`

5. Start backend from repo root:
   - `python -m uvicorn backend.main:app --reload --port 8000`

6. Verify (in a separate terminal):
   - `Invoke-RestMethod http://127.0.0.1:8000/health`

### C) Frontend (port 5173)

1. In a second terminal:
   - `cd demos/<demo>/frontend`

2. If port 5173 is already in use:
   - `powershell -ExecutionPolicy Bypass -File ..\..\..\.agent\skills\restart-demos\scripts\who-owns-port.ps1 -Port 5173`
   - Ask before stopping; if approved:
     - `powershell -ExecutionPolicy Bypass -File ..\..\..\.agent\skills\restart-demos\scripts\stop-port.ps1 -Port 5173 -Force`

3. Install deps (no deletes):
   - `pnpm install`

4. Start dev server:
   - `pnpm dev --port 5173`

### D) Report back

- Demo running: `<demo>`
- Backend: <http://127.0.0.1:8000>
- Health: <http://127.0.0.1:8000/health>
- Frontend: <http://localhost:5173>

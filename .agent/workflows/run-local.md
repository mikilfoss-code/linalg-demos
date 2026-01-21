---
description: "Run backend + one chosen demo locally (Windows PowerShell)"
---

Goal: run locally

1) Backend:
- Activate venv: C:\Users\mfoss3\.venvs\linalg-demos\Scripts\Activate.ps1
- From backend/: install deps (pip install -r requirements.txt) if needed
- Run: uvicorn main:app --reload --port 8000

2) Frontend (ask which demo):
- cd demos/<demo-name>/frontend
- pnpm install
- pnpm dev

Confirm:
- backend /health returns OK
- frontend loads and can call the backend base URL

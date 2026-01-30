---
name: update-demos
description: Update tools + dependencies for the linalg monorepo on Windows (uv, Volta/Node/pnpm, backend Python lock+sync, all demo frontends), then run verification and apply minimal code fixes required by upgrades.
---

# Update linalg monorepo (Windows)

## Inputs (defaults)

- upgrade level: patch/minor unless explicitly requested otherwise
- demos: all folders under `demos/*/frontend`
- backend port: 8000
- frontend port: 5173
- shared venv: `C:\Users\mfoss3\.venvs\linalg-demos`
- node major (default): 25
- pnpm major (default): 10

## Hard constraints

- Work only inside the repo root.
- Do NOT create per-demo venvs.
- Do NOT install Python packages globally or into user-site.
- Use pnpm (not npm) for frontend.
- Do NOT commit `node_modules/`.
- Keep changes reviewable (branch + small commits).
- Ask before any major version bumps (Python or JS).
- If a command fails, STOP and report the exact error + the command that produced it.

## Preferred execution (scripts)

From repo root, prefer running the scripts in `.agent/skills/update-demos/scripts/`:

- Safe default (no majors; Python lock refresh only if requested):  
  `powershell -ExecutionPolicy Bypass -File .agent\skills\update-demos\scripts\run-update.ps1`
- Allow Python dependency upgrades (explicit only):  
  `powershell -ExecutionPolicy Bypass -File .agent\skills\update-demos\scripts\run-update.ps1 -UpgradePython`
- Allow frontend majors (explicit only):  
  `powershell -ExecutionPolicy Bypass -File .agent\skills\update-demos\scripts\run-update.ps1 -LatestFrontends`

## 0) Preflight

1. Confirm repo root contains `backend/` and `demos/`.
2. Ensure git is clean:
   - `git status -sb`
3. Create/update a maintenance branch:
   - `git checkout -B chore/update-maintenance`

## 1) Toolchain policy (WinGet + Volta)

- Prefer WinGet to keep `uv` and `volta` current.
- Use Volta to manage both Node and pnpm.
- Corepack is not used in this repo/toolchain.

### Volta requirements

- `volta` must be on PATH.
- Volta pnpm support must be enabled:
  - Set Windows **User** env var: `VOLTA_FEATURE_PNPM=1`
  - Then restart Antigravity and all terminals so the env var is picked up.

PATH ordering guidance:

- `%LOCALAPPDATA%\Volta\bin` must appear before `C:\Program Files\Volta\`.
- `C:\Program Files\Volta\` must remain on PATH so `volta.exe` is resolvable.

Confirm:

- `volta --version`
- `node -v`
- `pnpm -v`
- `where.exe pnpm` shows the Volta shim first (typically under `%LOCALAPPDATA%\Volta\bin`).
- `where.exe volta` shows `C:\Program Files\Volta\volta.exe`.

## 2) Update core tools (Windows)

Prefer WinGet for Windows tools when available.

- Update uv (Astral):
  - `winget upgrade -e --id astral-sh.uv`
  - If missing: `winget install -e --id astral-sh.uv`
- Update Volta:
  - `winget upgrade -e --id Volta.Volta`
  - If missing: `winget install -e --id Volta.Volta`

Then align tool versions via Volta (defaults: Node 25, pnpm 10):

- `volta install node@25`
- `volta install pnpm@10`

Record versions for the report:

- `uv --version`
- `volta --version`
- `node -v`
- `pnpm -v`

## 3) Python: lock + exact sync (shared venv)

Goal:

- Keep the shared venv consistent with the repo’s lockfile.
- Do not upgrade Python dependencies unless explicitly requested.

1. Activate the shared venv:
   - `& "$env:USERPROFILE\.venvs\linalg-demos\Scripts\Activate.ps1"`

2. Ensure `backend/requirements.in` exists (direct deps only; add constraints here if you want to prevent majors).

3. Generate pinned lockfile (commit this):
   - Default (no upgrades):  
     `uv pip compile backend/requirements.in -o backend/requirements.txt`
   - If explicitly requested to upgrade deps:  
     `uv pip compile backend/requirements.in -o backend/requirements.txt --upgrade`

4. Exact sync the shared venv to the lockfile (removes extraneous packages):
   - `uv pip sync backend/requirements.txt`

5. Quick backend checks:
   - `python -m compileall .\backend`

## 4) Frontend: update all demos (pnpm)

For each folder matching `demos/*/frontend`:

1. Install:
   - `pnpm install`
2. Update dependencies:
   - Default: `pnpm up`
   - Majors ONLY if explicitly requested: `pnpm up --latest`
3. Verify:
   - `pnpm build`

If TypeScript reports `Cannot find type definition file for 'vite/client'`:

- This usually means dependencies are not installed successfully for that frontend.
- Re-run `pnpm install` in the affected `demos/<demo>/frontend`, then restart the TypeScript server in the editor.

## 5) Verification

Backend (manual; run in a dedicated terminal when desired):

- `python -m uvicorn backend.main:app --reload --port 8000`
- Health check: `Invoke-RestMethod http://127.0.0.1:8000/health`

Frontends:

- Ensure `pnpm build` succeeds for each affected demo.

## 6) Minimal code updates (only if needed)

If dependency updates break build/runtime:

- Fix only what is required to restore:
  - backend import/startup + `/health`
  - each affected demo `pnpm build`
- Do NOT refactor unrelated code.
- Update CODEMAP.md only if public endpoints, directory structure, or key global constants/objects changed.

## 7) Commit + report

Make small commits:

1. tooling scripts / skill docs (if changed)
2. `backend/requirements.txt` (lock refresh)
3. frontend lockfile updates (group by demo or “all demos”)
4. code fixes (if any)

Report:

- tool versions before/after (uv, volta, node, pnpm)
- Python lock changed packages (top-level + notable transitive)
- demos successfully built
- any majors deferred

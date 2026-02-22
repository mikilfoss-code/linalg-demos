---
trigger: always_on
---

# Linear Algebra Demos Monorepo Rules (Windows)

---

## Mandatory Pre-Edit Gate

These steps are required before any file edit or file-modifying command.

1. Read `AGENT.md` in the repo root.
2. Read `CODEMAP.md` in the repo root.
3. For substantial changes, post a response containing all three sections:
   - `Reasoning`
   - `Solution Options`
   - `Trade-Offs`
4. For substantial changes, ask the user to select an option.
5. If the change is substantial, ask for explicit authorization to proceed.
6. For substantial changes, only after steps 4 and 5 are satisfied may code edits begin.
7. For minor changes, option selection and explicit authorization are not required.

## Substantial change definition

A substantial change includes any of the following:

- new dependency
- new route/endpoint
- schema/contract change
- multi-module refactor
- user-visible behavior change

## Completion requirement

After edits are complete:

1. State either `No CODEMAP update needed.` or update `CODEMAP.md` in the same change set.
2. Summarize what changed and why.

## Exception

If the user asks for analysis only (no edits/commands that modify files), steps 3 to 6 can be skipped.

## Scope / Safety

- Unless the user authorizes it, never create, move, or delete files outside this repository root.
- Avoid destructive actions (mass delete/rename) unless explicitly requested.

## Repo layout

- Backend code lives only in `backend\`.
- Each demo frontend lives only in `demos\<demo-name>\frontend\`
  (example: `demos\linalg-vectors\frontend\`).
- Do not create per-demo Python venvs in the repo.

## Python environment policy

- DO NOT create a new venv per project.
- Use the shared venv at: `C:\Users\mfoss3\.venvs\linalg-demos`
- Do NOT install Python packages globally or into user-site.
- Prefer `uv` for installs when available:
  - `uv pip compile backend\requirements.in -o backend\requirements.txt`
  - `uv pip sync backend\requirements.txt`
  - fallback: `python -m pip install -r backend\requirements.in`
- When adding dependencies: update `backend\requirements.in`, then recompile `backend\requirements.txt`, and explain why.
- Canonical backend run command from repo root: `python -m uvicorn backend.main:app --reload --port 8000`

## JS environment policy

- Run Node commands from `demos\<demo-name>\frontend\`.
- Use `pnpm` (not `npm`) for installs and scripts.
- Respect the repo’s pinned Node toolchain:
  - locally: use Volta (if present) and prefer `volta pin ...` when setting versions
  - do not assume Volta exists in CI/Render; rely on the repo configuration (e.g., `package.json` engines) for deployment
- Each demo frontend has its own `package.json`.

## Git policy

- Never commit `node_modules/`, build outputs, or local env files.
- Ensure the repo has a `.gitignore` that excludes:
  - `**/node_modules/`
  - `**/dist/`, `**/.vite/`
  - `.env`, `.env.*`
  - `__pycache__/`, `*.pyc`

## Verification

- For backend changes: run a quick import check and hit `/health`.
- For frontend changes: ensure `pnpm build` succeeds for the affected demo.

# Linear Algebra Demos Monorepo Rules (Windows)

## Scope / Safety
- Never create, move, or delete files outside this repository root.
- Avoid destructive actions (mass delete/rename) unless explicitly requested.
- Prefer small, reviewable changes.

## Repo layout
- Backend code lives only in `backend/`.
- Each demo frontend lives only in `demos/<demo-name>/frontend/`
  (example: `demos/linalg-vectors/frontend/`).
- Do not create per-demo Python venvs in the repo.

## Python environment policy
- DO NOT create a new venv per project.
- Use the shared venv at: `C:\Users\mfoss3\.venvs\linalg-demos`
- Do NOT install Python packages globally or into user-site.
- Prefer `uv` for installs when available:
  - `uv pip install -r backend/requirements.txt`
  - fallback: `python -m pip install -r backend/requirements.txt`
- When adding dependencies: update `backend/requirements.txt` and explain why.

## JS environment policy
- Run Node commands from `demos/<demo-name>/frontend/`.
- Use `pnpm` (not `npm`) for installs and scripts.
- Respect the repo’s pinned Node toolchain:
  - locally: use Volta (if present) and prefer `volta pin ...` when setting versions
  - do not assume Volta exists in CI/Render; rely on the repo configuration (e.g., `package.json` engines) for deployment
- Each demo frontend has its own `package.json` and lockfile.

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

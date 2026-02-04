---
name: update-scan
description: Scan this linalg monorepo for dependency updates across backend Python manifests and demo frontend package.json files, then write a consolidated updates report without modifying tracked dependency files. Use when asked to check outdated packages, preview upgrades, or produce dependency status reports.
---

# SKILL.md — Dependency Update Scanner (Antigravity / Codex)

## Goal

Scan this repo for **all dependency manifests** (Python + Node/TypeScript frontends), and report **which packages have updates available**, without modifying lockfiles or installing anything globally.

This skill is **read-only by default**: it may run commands that query registries, but it must not change tracked files unless explicitly instructed.

## Repo assumptions

- Monorepo layout:
  - `backend/` (FastAPI/Uvicorn; Python deps managed with `uv`)
  - `demos/<demo-name>/frontend/` (Vite + TypeScript; Node deps managed with `pnpm` via Volta)
- Python policy: use `uv pip compile` + `uv pip sync` workflow (compile from `backend/requirements.in` to `backend/requirements.txt`). `uv pip compile` supports `--upgrade`.
- Node policy: use Volta to pin Node + pnpm (no Corepack). Volta pins tool versions in `package.json` under a `volta` field.
- `pnpm outdated` supports JSON output and a `--compatible` mode (updates that stay within the ranges in `package.json`).

## Safety / non-goals

- **DO NOT** run `pnpm up`, `pnpm install`, `uv pip sync`, `uv pip install`, `uv self update`, or any command that changes dependencies/lockfiles.
- **DO NOT** add or remove dependencies.
- **DO NOT** change Volta pins (no `volta pin` / `volta install`).
- **DO NOT** commit, push, or open PRs unless explicitly requested.
- Prefer “report-only”: output findings to a report file under `reports/` (create the folder if missing). Only output to console if the user explicitly requests it.
- Creating untracked report artifacts under `reports/` is allowed (`reports/dependency-updates.md`, `reports/outdated/*.json`, `reports/requirements.upgraded.txt`).

## What to scan (discovery)

From repo root:

1. Confirm you’re at the repository root:
   - `git rev-parse --show-toplevel`
2. Locate dependency manifests:
   - Python:
     - `backend/requirements.in` (source of truth)
     - `backend/requirements.txt` (compiled lock)
     - Also scan for `pyproject.toml`, `setup.cfg`, `setup.py` (if present).
   - Node:
     - All `package.json` files under:
       - `demos/*/frontend/package.json`
     - Also check if there is a root `package.json` (tooling scripts, shared config).

Suggested commands (Windows PowerShell):

- `@( 'backend/requirements.in', 'backend/requirements.txt' ) | ForEach-Object { if (Test-Path $_) { $_ } }`
- `Get-ChildItem -Path . -Recurse -File -Include pyproject.toml,setup.cfg,setup.py | ForEach-Object { $_.FullName }`
- `Get-ChildItem -Path demos -Recurse -File -Filter package.json | Where-Object { $_.FullName -match '[\\\\/]frontend[\\\\/]package\.json$' } | ForEach-Object { $_.FullName }`
- `if (Test-Path .\\package.json) { Resolve-Path .\\package.json }` (to catch a root manifest)

(Use `Resolve-Path .` to confirm you are at repo root if needed.)

## Node/Frontend: check outdated packages

For each `package.json` you found (especially each `demos/<demo>/frontend`):

1. Record toolchain versions (to verify Volta is active):
   - `node --version`
   - `pnpm --version`
2. Run `pnpm outdated` in JSON mode (for machine-parsing):
   - Full “latest available” view:
     - `pnpm outdated --long --format json`
   - “Compatible updates only” (stays within current semver ranges in `package.json`):
     - `pnpm outdated --long --format json --compatible`
3. Save outputs to a temp location for aggregation, e.g.:
   - `reports/outdated/<demo>-outdated.json`
   - `reports/outdated/<demo>-outdated-compatible.json`

Notes:

- Do **not** run `pnpm update` / `pnpm up`. (That would modify `package.json` and/or lockfiles.)
- `pnpm outdated` should be treated as read-only; it queries registries and prints results.
- If registry access is blocked, record the exact command and error text in the report, then continue scanning the remaining manifests and ship a partial report.

## Python/Backend: check for available updates

You want two complementary signals:

### A) “If we upgraded, what would change?” (preferred for your workflow)

1. Generate an upgraded compile output from `backend/requirements.in`:
   - Primary approach:
     - `uv pip compile backend/requirements.in --upgrade -o reports/requirements.upgraded.txt`
2. Compare `backend/requirements.txt` vs the upgraded output and list packages where versions differ.

Important robustness note:

- There is a recent report that `uv pip compile -o/--output-file` may write to stdout instead of the file in some cases; if the output file isn’t created/updated, redirect stdout instead as a workaround:
  - `uv pip compile backend/requirements.in --upgrade > reports/requirements.upgraded.txt`

### B) “What’s installed in the environment that is outdated?”

If a backend virtual environment is present/active, run:

- `uv pip list --outdated --format json`

This feature exists and is commonly used to query newer versions.

If `--outdated` fails in your environment, fall back to approach (A) and report that `uv pip list --outdated` was unavailable in the current setup.
If registry access is blocked for Python queries, record the failure in the report and continue with any available local comparison outputs.

## Aggregation: produce a single report

Create `reports/dependency-updates.md` with sections:

1. **Summary**
   - Count of outdated packages per frontend
   - Count of Python packages that would change under `--upgrade`
2. **Toolchain**
   - For each frontend: `node --version`, `pnpm --version`
   - For Python: `uv --version`, `python --version` (if available)
3. **Frontends**
   - For each demo frontend:
     - package name (from `package.json`)
     - dependencies/devDependencies outdated (from `pnpm outdated` JSON)
     - include both:
       - compatible updates
       - latest updates
4. **Backend (Python)**
   - List packages that would change (current pinned -> upgraded pinned)
   - Note any “unsafe” pins that appear (e.g., setuptools/pip) as informational only.

Output formatting guideline:

- Use a table with columns: `package`, `current`, `wanted/compatible`, `latest`, `type (dep/dev)`, `scope (backend/demo-name)`.
- Keep it deterministic: sort by scope, then package name.

## Exit criteria

This skill is successful when:

- Every `demos/*/frontend/package.json` has been checked with `pnpm outdated` (JSON saved + summarized).
- `backend/requirements.in` has been compiled in “upgrade preview” mode and compared to the current lock.
- A consolidated report is produced, and **no tracked files are modified**.

## Troubleshooting

- If `pnpm` isn’t available or isn’t Volta-managed, record:
  - `Get-Command pnpm`
  - `where.exe pnpm`
  - `pnpm --version`
  - and stop; do not attempt Corepack.
- If `uv pip compile -o` doesn’t write the file, use stdout redirection (see note above).
- If `uv pip list --outdated` errors, rely on the `--upgrade` compile diff instead and report the error text.
- If any registry query is blocked by network/sandbox policy, record the blocked command + error and continue generating a partial report from successful checks.

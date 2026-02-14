# Dependency update report

Generated: 2026-02-13 17:19:43

## Toolchain

| Tool   | Version       |
| ------ | ------------- |
| git    | V1            |
| node   | v25.6.1       |
| pnpm   | 10.29.3       |
| python | Python 3.14.3 |
| uv     | V2            |
| volta  | 2.0.2         |

Legend:
Version keys:
- V1: git version 2.53.0.windows.1
- V2: uv 0.10.2 (a788db7e5 2026-02-10)

## Toolchain upgrade availability (read-only)

| Tool       | Current | Latest  | Status     | Source | Notes              |
| ---------- | ------- | ------- | ---------- | ------ | ------------------ |
| git        | 2.53.0  | 2.53.0  | up_to_date | S51    |                    |
| pip-system | 26.0.1  | 26.0.1  | up_to_date | S52    |                    |
| pip-venv   | 26.0.1  | 26.0.1  | up_to_date | S52    |                    |
| pnpm       | 10.29.3 | 10.29.3 | up_to_date | S53    |                    |
| python     | 3.14.3  | 3.14.3  | up_to_date | S54    | used tags fallback |
| uv         | 0.10.2  | 0.10.2  | up_to_date | S55    |                    |
| volta      | 2.0.2   | 2.0.2   | up_to_date | S56    |                    |

Legend:
Source keys:
- S51: https://api.github.com/repos/git-for-windows/git/releases/latest
- S52: https://pypi.org/pypi/pip/json
- S53: https://registry.npmjs.org/pnpm/latest
- S54: https://api.github.com/repos/python/cpython/releases?per_page=100; https://api.github.com/repos/python/cpython/tags?per_page=200
- S55: https://api.github.com/repos/astral-sh/uv/releases/latest
- S56: https://api.github.com/repos/volta-cli/volta/releases/latest

## Other Python manifests (discovery only)

_None found._

## Node/JS (pnpm outdated)

Scopes scanned: **3**

- Note: @types/node is a TypeScript package and is separate from the Node runtime.
- Node runtime target from .nvmrc: **25.6.0**
- Node runtime upgrade available (current -> target): **no**

| Scope     | Dir | Outdated (latest) | Outdated (compatible) |
| --------- | --- | ----------------- | --------------------- |
| S1        | D1  | 0                 | 0                     |
| S2        | D2  | 0                 | 0                     |
| node:root | .   | 0                 | 0                     |

Legend:
Scope keys:
- S1: node:frontend:linalg-matrix_transforms
- S2: node:frontend:linalg-vectors
Dir keys:
- D1: demos\linalg-matrix_transforms\frontend
- D2: demos\linalg-vectors\frontend

- Runtime dependency upgrades available: **0**
- Dev dependency upgrades available: **0**
- Runtime/dev relationship status: **match**

_No parsed Node outdated results._

### Outdated runtime dependencies

_No outdated runtime dependencies found._

### Outdated dev dependencies

_No outdated dev dependencies found._

### Runtime/Dev discrepancies

- Detected Node runtime: `v25.6.1`

_No runtime/dev discrepancies detected._

## Python backend (uv pip compile --upgrade preview)

- backend/requirements.in found: **True**
- backend/requirements.txt found: **True**
- compile mode: **upgrade**
- uv upgrade exit code: **0**
- uv effective exit code: **0**
- upgraded preview: `reports\requirements.upgraded.txt`
- uv stderr (upgrade): `reports\uv_compile.stderr.txt`

Counts: update=0, added=0, removed=0

| Package | Current | Upgraded | Status |
| ------- | ------- | -------- | ------ |

## Code Change Impact (Heuristic)

- Any likely code changes required if upgrades are installed: **no**
- Any upgrades that should be reviewed manually: **no**
- Note: this is a heuristic based on semantic version deltas and dependency category.

_No upgrade candidates to assess._

### Files to review if code changes are needed

_No likely code-change file targets identified._

## Upgrade Steps (Step-by-Step)

1. Update toolchain components with available upgrades (read-only checks above).
   - For Python/pip/backend commands, activate backend venv:
   - `& "$env:USERPROFILE\.venvs\linalg-demos\Scripts\Activate.ps1"`
   - Verify interpreter:
   - `python -c "import sys,os; print(sys.executable); print(os.environ.get('VIRTUAL_ENV'))"`
   - Verify pip in both contexts:
   - `py -m pip --version`
   - `& "C:\Users\mfoss3\.venvs\linalg-demos\Scripts\python.exe" -m pip --version`
   - Optional Volta project pinning (run once per demo project):
   - `volta pin node@lts` or `volta pin node@latest`
   - `volta pin pnpm@10.29.3` or `volta pin pnpm@latest`
   - Verify active/runtime tool versions:
   - `node -v`
   - `pnpm -v`
   - `volta list node`
   - `volta list pnpm`
   - Check demo project pin declarations (run from repo root `linalg`):
   - `Get-ChildItem demos -Recurse -Filter package.json | Where-Object { $_.FullName -notmatch '\\node_modules\\' } | Select-String -Pattern '"volta"|"packageManager"' | ForEach-Object { "{0}:{1}: {2}" -f $_.Path, $_.LineNumber, $_.Line.Trim() }`
   - Output format: `<path>:<line>: <matched text>`.
   - Optional cleanup: `volta uninstall pnpm@<unused-version>` (Volta does not currently support uninstalling Node runtimes).
   - No toolchain upgrades flagged as available.

2. Upgrade frontend runtime dependencies to latest (if any).
   - No outdated frontend runtime dependencies found.

3. Upgrade frontend dev dependencies to latest (if any).
   - No outdated frontend dev dependencies found.

4. Rebuild affected frontends.
   - No frontend scopes have outdated packages; no rebuild targets identified.

5. Apply backend Python upgrades from the requirements.in workflow.
   - Run from repo root (`linalg`) so `backend/...` paths resolve.
   - Activate shared backend venv:
   - `& "$env:USERPROFILE\.venvs\linalg-demos\Scripts\Activate.ps1"`
   - Verify interpreter is the shared venv:
   - `python -c "import sys,os; print(sys.executable); print(os.environ.get('VIRTUAL_ENV'))"`
   - Compile + sync:
   - `uv pip compile --upgrade backend/requirements.in -o backend/requirements.txt`
   - Verify: `git diff -- backend/requirements.txt`
   - `uv pip sync backend/requirements.txt`
   - Verify: `uv pip check`
   - No backend package changes detected in preview.

6. Re-run scan to confirm upgrades are complete.
   - `pwsh -NoProfile -File .agent/skills/update-scan/scripts/update-dep-scanner.ps1`

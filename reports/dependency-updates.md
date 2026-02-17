# Dependency update report

Generated: 2026-02-17 17:03:20

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

| Tool       | Current | Latest | Status         | Source | Notes |
| ---------- | ------- | ------ | -------------- | ------ | ----- |
| git        | 2.53.0  |        | latest_unknown | S51    | N1    |
| pip-system | 26.0.1  |        | latest_unknown | S52    | N1    |
| pip-venv   | 26.0.1  |        | latest_unknown | S52    | N1    |
| pnpm       | 10.29.3 |        | latest_unknown | S53    | N1    |
| python     | 3.14.3  |        | latest_unknown | S54    | N1    |
| uv         | 0.10.2  |        | latest_unknown | S55    | N1    |
| volta      | 2.0.2   |        | latest_unknown | S56    | N1    |

Legend:
Source keys:
- S51: https://api.github.com/repos/git-for-windows/git/releases/latest
- S52: https://pypi.org/pypi/pip/json
- S53: https://registry.npmjs.org/pnpm/latest
- S54: https://api.github.com/repos/python/cpython/releases?per_page=100
- S55: https://api.github.com/repos/astral-sh/uv/releases/latest
- S56: https://api.github.com/repos/volta-cli/volta/releases/latest
Notes keys:
- N1: latest lookup failed or blocked

## Other Python manifests (discovery only)

_None found._

## Node/JS (pnpm outdated)

Scopes scanned: **4**

- Note: @types/node is a TypeScript package and is separate from the Node runtime.
- Node runtime target from .nvmrc: **25.6.0**
- Node runtime upgrade available (current -> target): **no**

| Scope     | Dir | Outdated (latest) | Outdated (compatible) |
| --------- | --- | ----------------- | --------------------- |
| S1        | D1  | 0                 | 0                     |
| S2        | D2  | 0                 | 0                     |
| S3        | D3  | 0                 | 0                     |
| node:root | .   | 0                 | 0                     |

Legend:
Scope keys:
- S1: node:frontend:linalg-markov_chains
- S2: node:frontend:linalg-matrix_transforms
- S3: node:frontend:linalg-vectors
Dir keys:
- D1: demos\linalg-markov_chains\frontend
- D2: demos\linalg-matrix_transforms\frontend
- D3: demos\linalg-vectors\frontend

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
- compile mode: **failed**
- uv upgrade exit code: **2**
- uv fallback exit code: **2**
- uv effective exit code: **2**
- upgraded preview: `reports\requirements.upgraded.txt`
- uv stderr (upgrade): `reports\uv_compile.stderr.txt`
- uv stderr (fallback): `reports\uv_compile.fallback.stderr.txt`

_No Python diffs reported (or preview not run)._

### Python scan notes / errors

- uv pip compile --upgrade exited with code 2: continuing with partial report. Detected: registry unreachable (pypi.org). See C:\Users\mfoss3\Documents\Coding\webapps\linalg\reports\uv_compile.stderr.txt. stderr: WARN Retry attempt #0. Sleeping 222.5545ms before the next attempt | WARN Retry attempt #0. Sleeping 418.0144ms before the next attempt
- uv pip compile fallback (without --upgrade) exited with code 2: continuing with partial report. Detected: registry unreachable (pypi.org). See C:\Users\mfoss3\Documents\Coding\webapps\linalg\reports\uv_compile.fallback.stderr.txt. stderr: WARN Retry attempt #0. Sleeping 923.1914ms before the next attempt | WARN Retry attempt #0. Sleeping 99.6228ms before the next attempt

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
   - `volta pin pnpm@latest` or `volta pin pnpm@latest`
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
   - Backend upgrade preview failed; no reliable backend diff is available from this run.

6. Re-run scan to confirm upgrades are complete.
   - `pwsh -NoProfile -File .agent/skills/update-scan/scripts/update-dep-scanner.ps1`

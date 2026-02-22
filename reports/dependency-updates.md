# Dependency update report

Generated: 2026-02-22 09:43:12

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

| Tool       | Current | Latest  | Status            | Source | Notes              |
| ---------- | ------- | ------- | ----------------- | ------ | ------------------ |
| git        | 2.53.0  | 2.53.0  | up_to_date        | S51    |                    |
| pip-system | 26.0.1  | 26.0.1  | up_to_date        | S52    |                    |
| pip-venv   | 26.0.1  | 26.0.1  | up_to_date        | S52    |                    |
| pnpm       | 10.29.3 | 10.30.1 | upgrade_available | S53    |                    |
| python     | 3.14.3  | 3.14.3  | up_to_date        | S54    | used tags fallback |
| uv         | 0.10.2  | 0.10.4  | upgrade_available | S55    |                    |
| volta      | 2.0.2   | 2.0.2   | up_to_date        | S56    |                    |

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

Scopes scanned: **4**

- Note: @types/node is a TypeScript package and is separate from the Node runtime.
- Node runtime target from .nvmrc: **25.6.0**
- Node runtime upgrade available (current -> target): **no**

| Scope     | Dir | Outdated (latest) | Outdated (compatible) |
| --------- | --- | ----------------- | --------------------- |
| S1        | D1  | 1                 | 1                     |
| S2        | D2  | 1                 | 1                     |
| S3        | D3  | 1                 | 1                     |
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
- Dev dependency upgrades available: **3**
- Runtime/dev relationship status: **match**

### Outdated packages (merged)

| Scope | Package     | Type            | Current | Compatible | Wanted | Latest |
| ----- | ----------- | --------------- | ------- | ---------- | ------ | ------ |
| S1    | @types/node | devDependencies | 25.2.3  | 25.2.3     | 25.2.3 | 25.3.0 |
| S2    | @types/node | devDependencies | 25.2.3  | 25.2.3     | 25.2.3 | 25.3.0 |
| S3    | @types/node | devDependencies | 25.2.3  | 25.2.3     | 25.2.3 | 25.3.0 |

Legend:
Scope keys:
- S1: node:frontend:linalg-markov_chains
- S2: node:frontend:linalg-matrix_transforms
- S3: node:frontend:linalg-vectors

### Outdated runtime dependencies

_No outdated runtime dependencies found._

### Outdated dev dependencies

| Scope | Package     | Type            | Current | Compatible | Wanted | Latest |
| ----- | ----------- | --------------- | ------- | ---------- | ------ | ------ |
| S1    | @types/node | devDependencies | 25.2.3  | 25.2.3     | 25.2.3 | 25.3.0 |
| S2    | @types/node | devDependencies | 25.2.3  | 25.2.3     | 25.2.3 | 25.3.0 |
| S3    | @types/node | devDependencies | 25.2.3  | 25.2.3     | 25.2.3 | 25.3.0 |

Legend:
Scope keys:
- S1: node:frontend:linalg-markov_chains
- S2: node:frontend:linalg-matrix_transforms
- S3: node:frontend:linalg-vectors

### Runtime/Dev discrepancies

- Detected Node runtime: `v25.6.1`

_No runtime/dev discrepancies detected._

### Node scan notes

- pnpm latest scan for node:frontend:linalg-markov_chains returned non-zero exit code 126, but JSON parsed successfully (informational).
- pnpm compatible scan for node:frontend:linalg-markov_chains returned non-zero exit code 126, but JSON parsed successfully (informational).
- pnpm latest scan for node:frontend:linalg-matrix_transforms returned non-zero exit code 126, but JSON parsed successfully (informational).
- pnpm compatible scan for node:frontend:linalg-matrix_transforms returned non-zero exit code 126, but JSON parsed successfully (informational).
- pnpm latest scan for node:frontend:linalg-vectors returned non-zero exit code 126, but JSON parsed successfully (informational).
- pnpm compatible scan for node:frontend:linalg-vectors returned non-zero exit code 126, but JSON parsed successfully (informational).

## Python backend (uv pip compile --upgrade preview)

- backend/requirements.in found: **True**
- backend/requirements.txt found: **True**
- compile mode: **upgrade**
- uv upgrade exit code: **0**
- uv effective exit code: **0**
- upgraded preview: `reports\requirements.upgraded.txt`
- uv stderr (upgrade): `reports\uv_compile.stderr.txt`

Counts: update=2, added=0, removed=0

| Package | Current | Upgraded | Status |
| ------- | ------- | -------- | ------ |
| fastapi | 0.129.0 | 0.129.2  | update |
| uvicorn | 0.40.0  | 0.41.0   | update |

## Code Change Impact (Heuristic)

- Any likely code changes required if upgrades are installed: **no**
- Any upgrades that should be reviewed manually: **yes**
- Note: this is a heuristic based on semantic version deltas and dependency category.

| Ecosystem | Scope   | Package     | Type            | Current | Target  | Delta | Rec | Reason |
| --------- | ------- | ----------- | --------------- | ------- | ------- | ----- | --- | ------ |
| node      | S1      | @types/node | devDependencies | 25.2.3  | 25.3.0  | minor | LNC | R91    |
| node      | S2      | @types/node | devDependencies | 25.2.3  | 25.3.0  | minor | LNC | R91    |
| node      | S3      | @types/node | devDependencies | 25.2.3  | 25.3.0  | minor | LNC | R91    |
| python    | backend | fastapi     | runtime         | 0.129.0 | 0.129.2 | patch | LNC | R92    |
| python    | backend | uvicorn     | runtime         | 0.40.0  | 0.41.0  | minor | RR  | R93    |

Legend:
Scope keys:
- S1: node:frontend:linalg-markov_chains
- S2: node:frontend:linalg-matrix_transforms
- S3: node:frontend:linalg-vectors
Reason keys:
- R91: Dev-dependency patch/minor upgrades are usually tooling/type updates.
- R92: Framework patch upgrade is typically backward compatible.
- R93: Package minor upgrade may require validation.

Rec legend:
- NCE: no_changes_expected
- LNC: likely_no_changes
- RR: review_recommended
- LCR: likely_changes_required

### Files to review if code changes are needed

| Ecosystem | Scope   | Package | Recommendation | Files | Reason |
| --------- | ------- | ------- | -------------- | ----- | ------ |
| python    | backend | uvicorn | RR             | F1    | R61    |

Legend:
Files keys:
- F1: backend/datasets.py; backend/main.py
Reason keys:
- R61: Package minor upgrade may require validation.

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
   - `volta pin pnpm@10.30.1` or `volta pin pnpm@latest`
   - Verify active/runtime tool versions:
   - `node -v`
   - `pnpm -v`
   - `volta list node`
   - `volta list pnpm`
   - Check demo project pin declarations (run from repo root `linalg`):
   - `Get-ChildItem demos -Recurse -Filter package.json | Where-Object { $_.FullName -notmatch '\\node_modules\\' } | Select-String -Pattern '"volta"|"packageManager"' | ForEach-Object { "{0}:{1}: {2}" -f $_.Path, $_.LineNumber, $_.Line.Trim() }`
   - Output format: `<path>:<line>: <matched text>`.
   - Optional cleanup: `volta uninstall pnpm@<unused-version>` (Volta does not currently support uninstalling Node runtimes).
   - `pnpm` (10.29.3 -> 10.30.1): `volta install pnpm@latest`
   - Verify: `pnpm -v`
   - `uv` (0.10.2 -> 0.10.4): `uv self update`
   - Verify: `uv --version`

2. Upgrade frontend runtime dependencies to latest (if any).
   - No outdated frontend runtime dependencies found.

3. Upgrade frontend dev dependencies to latest (if any).
   - `pnpm --dir demos\linalg-markov_chains\frontend add -D @types/node@latest`
   - Verify: `pnpm --dir demos\linalg-markov_chains\frontend list --depth -1 @types/node`
   - `pnpm --dir demos\linalg-matrix_transforms\frontend add -D @types/node@latest`
   - Verify: `pnpm --dir demos\linalg-matrix_transforms\frontend list --depth -1 @types/node`
   - `pnpm --dir demos\linalg-vectors\frontend add -D @types/node@latest`
   - Verify: `pnpm --dir demos\linalg-vectors\frontend list --depth -1 @types/node`

4. Rebuild affected frontends.
   - `pnpm --dir demos\linalg-markov_chains\frontend build`
   - Verify: `$LASTEXITCODE` (expect 0)
   - `pnpm --dir demos\linalg-matrix_transforms\frontend build`
   - Verify: `$LASTEXITCODE` (expect 0)
   - `pnpm --dir demos\linalg-vectors\frontend build`
   - Verify: `$LASTEXITCODE` (expect 0)

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
   - Packages identified by scan:
   - `fastapi`: `0.129.0` -> `0.129.2` (update)
   - `uvicorn`: `0.40.0` -> `0.41.0` (update)
   - Verify expected pins in `backend/requirements.txt`:
   - `Select-String -Path backend/requirements.txt -Pattern '^fastapi==0\.129\.2$'`
   - `Select-String -Path backend/requirements.txt -Pattern '^uvicorn==0\.41\.0$'`

6. Re-run scan to confirm upgrades are complete.
   - `pwsh -NoProfile -File .agent/skills/update-scan/scripts/update-dep-scanner.ps1`

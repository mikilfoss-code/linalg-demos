# Dependency update report

Generated: 2026-02-06 19:51:09

## Toolchain

| Tool   | Version                          |
| ------ | -------------------------------- |
| git    | git version 2.52.0.windows.1     |
| node   | v25.5.0                          |
| pnpm   | 10.28.2                          |
| uv     | uv 0.9.26 (ee4f00362 2026-01-15) |
| python | Python 3.14.2                    |

## Other Python manifests (discovery only)

_None found._

## Node/JS (pnpm outdated)

Scopes scanned: **2**

- Note: @types/node is a TypeScript package and is separate from the Node runtime.
- Node runtime target from .nvmrc: **25.6.0**
- Node runtime upgrade available (current -> target): **yes**

| Scope                | Dir                  | Outdated (latest) | Outdated (compati... |
| -------------------- | -------------------- | ----------------- | -------------------- |
| node:frontend:lin... | demos\linalg-matr... | 0                 | 0                    |
| node:frontend:lin... | demos\linalg-vect... | 0                 | 0                    |

- Runtime dependency upgrades available: **0**
- Dev dependency upgrades available: **0**
- Runtime/dev relationship status: **match**

_No parsed Node outdated results._

### Outdated runtime dependencies

_No outdated runtime dependencies found._

### Outdated dev dependencies

_No outdated dev dependencies found._

### Runtime/Dev discrepancies

- Detected Node runtime: `v25.5.0`

_No runtime/dev discrepancies detected._

## Python backend (uv pip compile --upgrade preview)

- backend/requirements.in found: **True**
- backend/requirements.txt found: **True**
- uv exit code: **0**
- upgraded preview: `reports\requirements.upgraded.txt`
- uv stderr: `reports\uv_compile.stderr.txt`

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

1. Upgrade frontend runtime dependencies to latest.
   - No outdated frontend runtime dependencies found.

2. Upgrade frontend dev dependencies to latest.
   - No outdated frontend dev dependencies found.

3. Rebuild affected frontends.
   - No frontend scopes were scanned.

4. Apply backend Python upgrades from the requirements.in workflow.
   - Verify interpreter is the shared venv:
   - `python -c "import sys,os; print(sys.executable); print(os.environ.get('VIRTUAL_ENV'))"`
   - Compile + sync:
   - `uv pip compile backend/requirements.in -o backend/requirements.txt`
   - `uv pip sync backend/requirements.txt`
   - No backend package changes detected in preview.

5. Re-run scan to confirm upgrades are complete.
   - `pwsh -NoProfile -File .agent/skills/update-scan/scripts/update-dep-scanner.ps1`

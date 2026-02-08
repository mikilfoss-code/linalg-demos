---
name: update-scan
description: Scan this linalg monorepo for dependency updates across backend Python requirements and demo frontend package.json files, then write a consolidated updates report without modifying tracked dependency files. Use when asked to check outdated packages, preview upgrades, or produce dependency status reports.
---

# SKILL.md — Dependency Update Scanner (Antigravity / Codex)

## Goal

Scan this repo for dependency updates across:

- **Backend (Python)**: `backend/requirements.in` → upgrade-preview vs `backend/requirements.txt`
- **Frontends (Node/TS)**: `demos/*/frontend/package.json` via `pnpm outdated`
- **Node runtime/dev consistency**: report whether runtime and dev dependencies align (for example, `node` runtime vs `@types/node` major alignment and `engines.node` checks)

Produce a consolidated report under `reports/` **without modifying tracked dependency files**.

This skill is report-only: it may query registries, but must not install/upgrade/sync deps and must not modify lockfiles/manifests unless explicitly instructed.

## Implementation

This skill is implemented by running:

- `.agent/skills/update-scan/scripts/update-dep-scanner.ps1`

If the script file is missing, stop and report that it is missing (do not recreate it from memory).

## Safety / non-goals

**DO NOT** run:

- `pnpm install`, `pnpm up`, `pnpm update`
- `uv pip sync`, `uv pip install`
- `uv self update`, `pip install`, global installs
- anything that edits `package.json`, lockfiles, `backend/requirements.*`, or Volta pins

**DO NOT** commit/push unless explicitly asked.

Writing untracked artifacts under `reports/` is allowed.

## What the script scans

### Node scopes

- `demos/*/frontend/package.json`
- optional `./package.json` (if present)
- optional `backend/package.json` (if present)

### Python backend scope

- `backend/requirements.in` (source of truth)
- `backend/requirements.txt` (current compiled lock)

### Other Python manifests (discovery only)

If present, the script will list (but not evaluate for updates):

- `pyproject.toml`, `setup.cfg`, `setup.py`

## Outputs

The script writes:

- `reports/dependency-updates.md` (consolidated report)
- `reports/outdated/<scope>-latest.json` (raw `pnpm outdated` JSON)
- `reports/outdated/<scope>-compatible.json` (raw `pnpm outdated --compatible` JSON)
- `reports/outdated/<scope>-latest.stderr.txt` (stderr)
- `reports/outdated/<scope>-compatible.stderr.txt` (stderr)
- `reports/requirements.upgraded.txt` (stdout of `uv pip compile ... --upgrade`)
- `reports/uv_compile.stderr.txt` (stderr from uv compile)
- `reports/.uv-cache/` (scan-local uv cache to avoid global cache permission conflicts)

`dependency-updates.md` includes:

- merged outdated package list
- aligned markdown tables (pipe columns padded for readability)
- outdated runtime dependency list
- outdated dev dependency list
- runtime/dev discrepancy checks
- runtime current vs `.nvmrc` target check (so runtime version and `@types/node` are not conflated)
- explicit `current` / `compatible` / `wanted` / `latest` values sourced from `pnpm outdated` output
- heuristic code-change impact assessment for upgrade candidates
- file-level review suggestions for upgrades flagged as `review_recommended` or `likely_changes_required`
- step-by-step upgrade and .json files, requirements.in and requirements.txt update instructions at the end of the report. The instructions should ensure backend updates are perfermed in the virtual environment and frontend updates are performed in the local workspace.

## How to run (PowerShell)

From repo root:

```powershell
Set-Location (git rev-parse --show-toplevel)
pwsh -NoProfile -ExecutionPolicy Bypass -File .agent/skills/update-scan/scripts/update-dep-scanner.ps1
```

## Escalation reliability guidance

- Run escalated commands **one at a time** (avoid parallel escalations).
- Prefer direct `pwsh -File <script>` execution; avoid nested `pwsh -Command "... pwsh ..."` wrappers that are fragile with quoting.
- If a command is blocked (for example EPERM/EACCES/sandbox restrictions), record the failure and continue to produce a partial report.
- Do not treat blocked build/registry checks as fatal for the full scan.
- The scanner clears per-step stdout/stderr artifacts before each run so prior-run errors are not reported again.

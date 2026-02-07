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
- step-by-step upgrade instructions at the end of the report

## How to run (PowerShell)

From repo root:

```powershell
$root = git rev-parse --show-toplevel
Set-Location $root

# Process-scope bypass (no admin required) in case execution policy blocks .ps1
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

$script = Join-Path $root ".agent/skills/update-scan/scripts/update-dep-scanner.ps1"
pwsh -NoProfile -File $script
```

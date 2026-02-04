# linalg-demos (monorepo)

## Repo description

- Teaching-oriented interactive linear algebra demos with a shared Python API backend. Frontend may be built using three.js or similar libraries.
- Students will have access to the webapps but not the code.

## Communication and reasoning

### Before proposing modifications

- **Review CODEMAP.md:** Review the overview of the code and its structure provided in the CODEMAP.md file
- **Provide reasoning:** Before generating or suggesting any code changes, provide a "Reasoning" section outlining your architectural choices. Include details on what you are going to change and why.
- **Suggest code style options:** Produce a "Style Options" section. This should give the user implementation options such as functional (using pure functions and transformations), object-oriented, design pattern usage (such as factories and observers), and declarative. When possible suggest at least one option using functional programming and one option using design patterns and reusable solutions. If multiple tasks are to be performed, organize the options under headers identifying the task to be performed.
- **Explain trade-offs:** Produce a "Trade-Offs" section explaining the trade-offs (eg., performance vs. readability) for every non-trivial change proposed. If multiple tasks are to be performed, organize the trade-offs under headers identifying the task to be performed.
- **Request Authorization:** After producing the "Reasoning", "Trade-Offs", and "Style Options" sections, check with the user which options should be used. Do not generate actual code or modifications until AFTER reasoning and trade-offs are explained and the user has selected an option. Always require option selection; require explicit authorization only for substantial changes; for minor changes, selection alone is sufficient.
  - **Minor changes** include: single-file CSS/layout tweaks, small copy edits, isolated refactors with no behavior change, or updates limited to documentation.
  - **Substantial changes** include: new dependencies, new routes/endpoints, schema/contract changes, multi-module refactors, or changes that alter user-visible behavior.
  - If unsure whether a change is minor or substantial, ask the user explicitly before proceeding.

### Pre-modification checklist (before making code changes)

- [ ] CODEMAP.md reviewed
- [ ] "Reasoning" section produced and delivered
- [ ] "Style Options" section produced and delivered
- [ ] "Trade-Offs" section produced and delivered
- [ ] User has selected which options are to be used
- [ ] If changes are substantial, the user has given authorization to proceed.

### After authorization is given

- After generating code and making changes, provide a summary of the changes made and any additional notes.
- After completing a task, suggest additional changes that could be made to improve the code, reduce redundancy, or improve performance and user experience.
- Include comments within the code to explain its purpose and logic. Explain "the why" behind a non-obvious piece of logic and the reason the code is necessary.

### When stuck

- ask a clarifying question, propose a short plan, or open a draft PR with notes
- do not push large speculative changes without confirmation

## Comments and Code Documentation

- Provide clear, concise, and helpful comments for non-obvious logic or public interfaces.
- Use JSDoc strictly for intent and behavior: document @param logic, @returns context, expected @throws conditions, and any side effects.
- Never redeclare TypeScript types inside JSDoc tags.
- Use Python docstrings for Python code.

## Directory rules

- Backend: `backend/`
- Demos: `demos/<demo-name>/frontend/`
- Do not create per-demo Python venvs.

## Python execution policy (required)

- Shared venv path: `C:\Users\mfoss3\.venvs\linalg-demos`
- Install backend deps from `requirements.in` workflow:
  - `uv pip compile backend\requirements.in -o backend\requirements.txt`
  - `uv pip sync backend\requirements.txt`
  - fallback: `python -m pip install -r backend\requirements.in`
- Before running any Python command for the backend, verify the interpreter:
  - Run: `python -c "import sys,os; print(sys.executable); print(os.environ.get('VIRTUAL_ENV'))"`
  - It MUST point to `C:\Users\mfoss3\.venvs\linalg-demos`.
- If not, activate the shared venv at `C:\Users\mfoss3\.venvs\linalg-demos` and re-run the check.
- Never install Python packages unless the venv check passes.
- Canonical backend run command (from repo root): `python -m uvicorn backend.main:app --reload --port 8000`

## Frontend (per-demo)

- From `demos/<demo-name>/frontend/`:
  - `pnpm install`
  - `pnpm dev`
  - `pnpm build`

## Conventions

- Keep demos classroom-friendly.
- When adding dependencies, explain why.

## Documentation contract (required)

- `CODEMAP.md` at the repo root is the canonical code-structure overview.
- Update `CODEMAP.md` in the same PR/change set whenever you:
  - add/remove/rename files, modules, directories, routes, endpoints, scripts
  - change key functions/methods or their contracts
  - change global parameters/constants/env vars and what they affect
  - change global/shared objects/state (fields, lifecycle, invariants)
  - change data schemas/contracts (JSON, request/response shapes)
  - if structurally significant changes occurred, add suggestions for reducing code redundancy, and improving overall performance
- If no structural/contract/global changes occurred, explicitly state: “No CODEMAP update needed.”

# linalg-demos (monorepo)

## Enforcement Contract (Required)

Before any code modification:

1. Review the documentation set: `CODEMAP.md`, `LAYOUT.md`, `README.md`, `BACKEND.md`.
2. Review relevant demo documentation: `DEMO-VECTORS.md`, `DEMO-MATRIX_TRANSFORMATIONS.md`, and `DEMO-MARKOV_CHAINS.md`.
3. Provide `Reasoning`, `Style Options`, and `Trade-Offs` for substantial code changes requiring new dependencies, significant architectural changes, or alter user-visible behavior.
4. For substantial changes, wait for user option selection.
5. For substantial changes, wait for explicit user authorization.

If this sequence is skipped, stop immediately, disclose the miss, and offer to revert.

## Repo description

- Teaching-oriented interactive linear algebra demos with a shared Python API backend. Frontend may be built using three.js or similar libraries.
- Students will have access to the webapps but not the code.

## Communication and reasoning

### Before proposing modifications

- **Review CODEMAP.md:** Review the overview of the code and its structure provided in the CODEMAP.md file
- **Provide reasoning:** Before generating or suggesting any code changes, provide a "Reasoning" section outlining your architectural choices. Include details on what you are going to change and why.
- **Suggest solution options:** For substantial changes, produce a "Solution Options" section. This should give the user at least three implementation/solution options such as functional (using pure functions, transformations, category theoretical concepts), object-oriented, design pattern usage (such as prototypes,factories, decorators, observers, iterators, etc.), declarative, imperative, or hybrid (a mix of the above). When possible suggest at least one option using functional programming and one option using design patterns and reusable solutions. If multiple tasks are to be performed, organize the options for each task under headers identifying the task to be performed.
- **Explain trade-offs:** For substantial changes, produce a "Trade-Offs" section explaining the trade-offs (eg., performance vs. readability) for every non-trivial change proposed. If multiple tasks are to be performed, organize the trade-offs for each task under headers identifying the task to be performed.
- **Request Authorization:** For substantial changes, after producing the "Reasoning", "Trade-Offs", and "Solution Options" sections, check with the user which options are to be used. Do not generate actual code or modifications until AFTER reasoning and trade-offs are explained, the user has selected an option, and explicit authorization is given. For minor changes, option selection and explicit authorization are not required.
  - **Minor changes** include: single-file CSS/layout tweaks, small copy edits, isolated refactors with no behavior change, or updates limited to documentation.
  - **Substantial changes** include: new dependencies, new routes/endpoints, schema/contract changes, multi-module refactors, or changes that alter user-visible behavior.
  - If unsure whether a change is minor or substantial, ask the user explicitly before proceeding.

### Pre-modification checklist (before making code changes)

- [ ] CODEMAP.md reviewed
- [ ] LAYOUT.md reviewed
- [ ] README.md reviewed
- [ ] BACKEND.md reviewed
- [ ] Relevant DEMO-\*.md reviewed
- [ ] "Reasoning" section produced and delivered
- [ ] If substantial changes are to be made, "Style Options" section produced and delivered
- [ ] If substantial changes are to be made, "Trade-Offs" section produced and delivered
- [ ] If substantial changes are to be made, user has selected which options are to be used
- [ ] If changes are substantial, the user has given authorization to proceed. If uncertain, ask the user explicitly before proceeding.

### After authorization is given

- As code is generated and files are edited, provide the reasoning for the changes and an explanation of how the changes will contribute to the task at hand.
- After generating code and making changes, provide a summary of the changes made and any additional notes. When refering to specific blocks of code, include the line numbers with the filename.
- After completing a task, suggest additional changes that could be made to improve the code, reduce redundancy, or improve performance and user experience.
- Include comments within the code to explain its purpose and logic. Explain "the why" behind a non-obvious piece of logic and the reason the code is necessary.

### When stuck

- ask a clarifying question, propose a short plan, or open a draft PR with notes
- do not push large speculative changes without confirmation

## Comments and Code Documentation

- Provide clear, concise, and helpful comments for non-obvious logic or public interfaces.
- Use JSDoc strictly for intent and behavior: document @param logic, @returns context, expected @throws conditions, and any side effects.
- Comment on the purpose for defined functions, expected arguments, return values, and any side effects. If a function missing this comment is encountered, add it.
- Comment on the purpose for defined objects and classes and their key properties and fields. If a class or object missing this comment is encountered, add it.
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

- The required documentation set to review and maintain is:
  - `CODEMAP.md`: provides a high-level overview of the code structure and organization, including a “Source of Truth” list identifying which doc owns which topics (routes, state, tokens, schemas, deploy), a “Cross-System Dependency Summary” listing backend endpoints consumed by each demo and shared libs each demo depends on,the repo layout, demo structure, and backend structure, entrypoints, global parameters/constants/env vars, global objects/state, key modules and responsibilities, key functions and methods, global theme and style tokens, data contracts, and deployment notes.
  - `LAYOUT.md`: provides a high-level overview of the schema-driven layout system, including the layout schema, layout options, and layout engine.
  - `README.md`: provides a high-level overview of the project, including the project structure, demo structure, frontend structure, and backend structure.
  - `BACKEND.md`: provides an overview of the backend, including the backend structure, entrypoints, endpoint ownership, request/response contract lists, validation invariants, error mapping policies, key backend parameters/constants/env vars, key backend objects/state, key backend modules and responsibilities, key backend functions and methods, data contracts.
  - `DEMO-VECTORS.md`: provides an overview of the vectors demo, including the demo structure, entrypoints, key parameters/constants/env vars, key objects/state, key modules and responsibilities, key functions and methods, theme and style tokens, data and API contracts.
  - `DEMO-MATRIX_TRANSFORMATIONS.md`: provides an overview of the matrix transformations demo, including the demo structure, entrypoints, key parameters/constants/env vars, key objects/state, key modules and responsibilities, key functions and methods, theme and style tokens, data and API contracts.
  - `DEMO-MARKOV_CHAINS.md`: provides an overview of the Markov chains demo, including the demo structure, entrypoints, key parameters/constants/env vars, key objects/state, key modules and responsibilities, key functions and methods, theme and style tokens, data and API contracts.
- `DEMO-*.md`: should follow the template: overview, demo structure, entrypoints, key parameters/constants/env vars, key objects/state, key modules and responsibilities, key functions and methods, theme and style tokens, data and API contracts.
- If a `*.md` document is missing, create and populate it.
- Update the relevant document(s) in the same PR/change set whenever you:
  - add/remove/rename files, modules, directories, routes, endpoints, scripts
  - change key functions/methods or their contracts
  - change parameters/constants/env vars and what they affect
  - change objects/state (fields, lifecycle, invariants)
  - change data schemas/contracts (JSON, request/response shapes)
  - if structurally significant changes occurred, add suggestions for reducing code redundancy, and improving overall performance
- If no structural/contract or other significant changes occurred, explicitly state which docs required no updates.

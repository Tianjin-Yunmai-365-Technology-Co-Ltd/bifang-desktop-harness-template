---
name: define-product
description: Define or revise this repository's product intent, MVP boundaries, constraints, and measurable success criteria. Use when starting a project, turning an idea into a specification, resolving ambiguous requirements, changing scope, or deciding whether a requested feature belongs in the current version.
---

# Define Product

Turn a real problem into an approved, testable product boundary before business implementation begins. A neutral scaffold may already exist.

## Workflow

1. Read `docs/project_status/README.md` and the latest dated Product Status. If `docs/product_spec/` or `docs/adr/` already exists, read its index, the latest dated Product Spec, and the latest dated ADR; their absence is the expected state immediately after initialization. Follow explicit links from the latest ADR to older decisions that still constrain the request. Inspect whether `$initialize-rust-project` created a neutral `scaffold status` workspace; treat that workspace as an existing structural constraint, not as evidence of product intent.
2. Extract the core user, primary consumer, real scenario, input, output, and pain point from available evidence.
3. Ask only for missing information whose alternatives would materially change scope. Mark non-blocking unknowns as `待确定`; never invent them.
4. Express one outcome-focused goal without naming an implementation technology.
5. Define `包含`, `不包含`, assumptions, constraints, reliability requirements, and objectively observable success criteria.
6. Apply the scope gate to every proposed capability: include it only when the core loop cannot complete without it or reliability would otherwise be unacceptable.
7. After the user confirms the first downstream requirement, create `docs/product_spec/README.md`, today's `docs/product_spec/YYYYMMDD_product_spec.md`, `docs/adr/README.md`, and today's `docs/adr/YYYYMMDD_ADR.md`; then update today's `docs/project_status/YYYYMMDD_product_status.md`. On later dates, read the previous Product Spec and Product Status and synthesize complete current snapshots with the confirmed change; on the same date, update existing files. Give each confirmed requirement an independent ADR entry; append to the existing daily ADR instead of creating another file for the same date. When a neutral workspace exists, set the next action to `$plan-change` and `$implement-change`, explicitly replacing `scaffold status` with approved product commands and tests.

## Output Rules

- Preserve explicit non-goals.
- Separate current requirements from future candidates.
- Do not reinterpret an already initialized stack as a product decision, select additional technology, or create business implementation artifacts unless the user separately requests implementation.
- Do not mark the specification `Approved` without explicit user confirmation.
- End with unresolved decisions and the next concrete action.

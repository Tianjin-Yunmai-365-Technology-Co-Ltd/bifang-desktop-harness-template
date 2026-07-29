---
name: implement-change
description: Execute an approved repository work plan with the smallest scoped code, tests, documentation, project-memory changes, and development-loop verification. Use after $plan-change when the user asks to implement, build, fix, or complete a planned change; hand off to delivery verification only when acceptance or release preparation is also requested.
---

# Implement Change

Turn one approved plan into reviewable implementation without widening product scope or claiming delivery completion.

## Workflow

1. Apply the task-level collaboration gate in `AGENTS.md` before substantive implementation. Ask once whether to enable parallel Worktree + Subagent mode for this task; when approved and the current plan has safely independent ownership, use `$run-parallel-worktrees`. Otherwise implement in the current worktree with one Agent. Never inherit approval from a prior task.
2. Read `AGENTS.md`, `docs/product_spec/README.md` and the latest dated Product Spec, `docs/ENGINEERING_RULES.md`, `docs/project_status/README.md` and the latest dated Product Status, `docs/work_plan/README.md` and the latest dated Work Plan, `docs/adr/README.md`, the latest dated ADR and the older ADRs it explicitly references, verification records, technical debt, and the files named or implicated by the plan.
3. Confirm the product specification is approved, the plan is current, the user's request authorizes implementation, and all scope-changing decisions are resolved. Route product changes through `$define-product` and multi-step replanning through `$plan-change` before editing.
4. Inspect repository and worktree state. In a downstream project, require the canonical `git rev-parse --show-toplevel` to equal the current project root; a parent repository is not a valid substitute. Record branch, commit or unborn-HEAD state, and `git status --short`. Preserve user changes, identify overlaps, and stop rather than overwrite work whose intent cannot be safely reconciled.
5. Trace the existing execution path and tests before choosing files. Implement only the smallest change that completes the approved outcome; do not add speculative abstractions, adapters, dependencies, commands, or platform capabilities.
6. Keep business rules in the shared core and interface concerns in their adapter. For Rust projects, preserve the workspace, Tokio, MSRV, dependency, CLI contract, and cross-platform invariants in `docs/RUST_CLI_TEMPLATE.md`. When the plan requires invoking an external program or reading/writing files, read [references/capability-external-command.md](references/capability-external-command.md) or [references/capability-file-operations.md](references/capability-file-operations.md) before implementing.
7. Apply the approved file and module boundaries. Add meaningful Chinese business comments to every created or modified maintained data structure, interface, function, method, and test, using only the explicit exemptions in `docs/ENGINEERING_RULES.md`; do not generate comments that merely restate code.
8. Add or update tests with the implementation. Cover the core success path and highest-risk failure introduced or affected by the change; add CLI black-box coverage when machine behavior changes. Zero relevant tests is not an acceptable handoff.
9. Run the development-loop gate from narrow to broad: non-empty unit tests plus change-related format, lint, static, integration, contract, or minimal read-only smoke checks selected by risk. Fix ordinary failures within the authorized scope; do not defer a failing required check. A delivery-status review or release-path change runs only the relevant static, unit, and isolated contract checks; neither condition authorizes a production artifact, full startup smoke, Computer Use E2E, cross-platform candidate, archive, or human final review. Enter release-stage execution only when the user initiates a final-artifact build or release preparation. Before that build starts, record a fresh per-run selection for every heavy interactive acceptance; omitted optional checks remain `Not run`, never implied passes.
10. Update affected product behavior, today's complete Product Status and Work Plan snapshots, today's ADR when implementation resolves a decision, verification evidence, technical debt, release notes, and Changelog. On the first user- or maintainer-visible downstream change, create `docs/changelog/README.md` and today's `docs/changelog/YYYYMMDD_CHANGELOG.md`; never create Changelog content during neutral initialization. If a Product Spec, Product Status, or Work Plan file is first created on a later date, synthesize it from the previous dated file and today's changes rather than writing an increment. Re-check relevant design documents even for code-only changes; if a document or Changelog update is not applicable, record the reason in the plan or verification evidence. Do not rewrite unrelated history or close risks without evidence.
11. Inspect the final diff for placeholders, secrets, absolute local paths, unrelated edits, stale comments, and claims unsupported by executed checks. Treat soft line thresholds as review prompts rather than automatic failures.
12. Report the development evidence directly when the user requested implementation only. Hand the result to `$verify-delivery` only when the user also requests delivery acceptance, completion review, or release preparation. Use `$build-rust-release` only when a current-platform final artifact is in scope and `$prepare-release` only after acceptance evidence exists.

## Boundaries

- One active plan maps to one bounded implementation outcome.
- User authorization to implement does not authorize publishing, destructive migration, credential use, or new external side effects.
- Compilation or tests alone are development evidence, not delivery acceptance or release readiness.
- Do not mark human review `Approved` or turn unexecuted platform checks into passing evidence.
- Record newly discovered out-of-scope work in `docs/TECH_DEBT.md` instead of implementing it opportunistically.

## Completion

Report changed files and behavior, tests added, development checks executed, failures repaired, release-level checks not run, unverified platforms, remaining risks, and whether a `$verify-delivery` handoff was requested. Do not issue a release or delivery verdict from this Skill.

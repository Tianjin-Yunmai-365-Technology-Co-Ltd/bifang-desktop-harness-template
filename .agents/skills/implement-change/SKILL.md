---
name: implement-change
description: Execute the active Work Plan TodoList through implementation and non-empty unit/regression tests, iterating until the current batch is complete. Use after $plan-change for coding, fixes, or when milestone acceptance reopens Todo because expected logic is missing or behavior deviates.
---

# Implement Change

Complete the current Todo batch without widening scope or prematurely entering milestone acceptance.

## Workflow

1. Read `docs/AGENT_POLICY.md`. If `parallel_worktree_subagents` is `enabled`, use `$run-parallel-worktrees` only when the active batch has at least two independent write scopes and a clean committed baseline; otherwise choose the single-Agent current-worktree path without asking again. If the policy is `disabled`, use single Agent. Ask only for missing/invalid policy or genuinely unresolved applicability.
2. Read `AGENTS.md`, the latest dated Product Spec, latest dated Product Status, latest dated Work Plan, the latest dated ADR and its live references, `docs/ENGINEERING_RULES.md`, Verification, Tech Debt and every file implicated by the active Todo.
3. Confirm the Product Spec is approved, the plan contains Todo batches and verification milestones, and the user's request authorizes implementation. Route new product boundaries through `$define-product` and replan.
4. Verify the canonical Git root, branch, commit/unborn state and `git status --short`. Preserve user changes and stop rather than overwrite ambiguous overlap.
5. Select the first `pending`, `in_progress` or repairable `blocked` Todo whose dependencies are `done`. Mark only that Todo `in_progress`; do not silently mark later items complete.
6. Trace the execution path and existing tests. Implement the smallest complete behavior described by the Todo; do not leave Mock, stub, placeholder, scaffold behavior or a source-only fragment where the Todo requires a real user scenario.
7. Preserve shared-core/adapter, Rust/Tokio/MSRV/dependency, CLI contract, cross-platform, file-boundary and Chinese-comment rules. Read the applicable capability reference before external commands or file operations.
8. Add or update non-empty tests with the implementation. Cover the core success path and highest-risk failure or reproduced deviation; a milestone-found defect requires a regression test that fails before the repair and passes after it.
9. Run the Todo development gate from narrow to broad: unit/regression tests plus relevant format, lint, static, integration and contract checks. Do not run smoke or E2E in this Skill, even when project policy enables them.
10. Fix ordinary failures inside the approved scope and rerun affected checks. Mark the Todo `done` only when implementation and all required development checks pass; otherwise keep it `in_progress`/`blocked` with exact evidence.
11. Continue through the current batch while actionable non-`done` Todo remain. Do not stop at a partial implementation merely because one check passes.
12. When every Todo in the batch is `done`, update the Work Plan and Product Status to make the milestone entry condition visible. If the active goal includes completion or acceptance, hand the complete real candidate to `$verify-delivery`; otherwise report it as ready for that milestone without running smoke/E2E.
13. If `$verify-delivery` rejects the milestone for missing logic or behavior deviation, preserve its evidence, reopen or add the specific Todo, return here, implement the correction, add regression coverage and repeat until the batch can re-enter the complete milestone.
14. Update affected design docs and today's complete project-memory snapshots, including `docs/changelog/YYYYMMDD_CHANGELOG.md` when behavior or maintenance flow changed. Update Verification and Tech Debt as applicable. On a new date, synthesize each current snapshot from the previous dated file. Inspect the final diff for secrets, absolute local paths, unrelated edits, stale comments and unsupported claims.

## Boundaries

- One active plan maps to one bounded implementation outcome.
- Implementation authorization does not authorize destructive migration, credential use, publication, packaging, signing or external side effects outside the approved Todo.
- Compilation or tests prove Todo implementation, not milestone acceptance.
- Never turn missing required logic into `Partially verified`; keep or reopen a Todo and continue.

## Completion

Report Todo statuses, changed behavior/files, tests, development checks, repaired failures, milestone readiness, unverified scope and remaining risks. Do not issue a milestone or release verdict from this Skill.

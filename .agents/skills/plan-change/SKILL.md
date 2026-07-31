---
name: plan-change
description: Create or revise an implementation-ready TodoList and verification milestones for a scoped repository change. Use when an approved requirement spans implementation work, affects several project areas, needs risk analysis, or must persist across sessions before coding and acceptance.
---

# Plan Change

Turn one approved scope into Todo batches whose completion gates real milestone acceptance.

## Workflow

1. Work in the current worktree during planning. Do not start coding, Worktrees, smoke or E2E.
2. Read the latest dated Product Spec, latest dated Product Status, `docs/AGENT_POLICY.md`, `docs/ENGINEERING_RULES.md`, the latest dated ADR, implicated repository areas and the current Work Plan when present.
3. Confirm the request is inside approved scope. Route scope changes through `$define-product`.
4. Map current behavior, tests and user changes. Preserve existing work and identify exact overlaps.
5. Define in-scope and out-of-scope boundaries. Resolve every choice that would materially change product behavior; expose unresolved blockers.
6. Split work into dependency-ordered Todo batches. Every Todo must have:
   - a stable ID;
   - one observable expected behavior;
   - exact file/module ownership or investigation boundary;
   - dependencies and risks;
   - a non-empty unit/regression test or an approved exception;
   - related static/integration/contract checks;
   - one status from `pending`, `in_progress`, `blocked`, `done`.
7. Keep a Todo non-`done` until its implementation and required checks pass. If any Todo in the current batch is non-`done`, the plan must remain in the coding loop and must not schedule smoke, E2E, packaging, publication or milestone acceptance.
8. Define one verification milestone per releasable batch. Each milestone must state:
   - entry condition: every Todo in its batch is `done`;
   - the complete real artifact and source commit to accept;
   - approved success and highest-risk failure scenarios;
   - explicit rejection of Mock, stub, placeholder, scaffold, source snippet and dev preview substitutes;
   - compile/build, non-empty unit, integration/contract and artifact-existence evidence;
   - `milestone_smoke` and `milestone_e2e` resolution from project policy, hard requirements and applicability;
   - failure routing that reopens/adds Todo and returns to `$implement-change`.
9. Read `parallel_worktree_subagents` only to record the likely implementation path. `enabled` permits later autonomous use only when at least two non-overlapping write scopes and a safe Git baseline exist; `disabled` selects single Agent. Ask only when the policy is missing/invalid or applicability cannot be resolved.
10. On the first downstream plan, create the Work Plan index and today's dated file. Otherwise update today's complete plan and Product Status snapshot. New-date files synthesize its still-valid content from the previous snapshot. Ensure the confirmed requirement has a current ADR entry.

## Quality Rules

- Use repository facts; do not invent files, commands, APIs, dependencies or artifacts.
- Keep current plan content about active Todo and milestone gates. Put executed results in Product Status, Verification, ADR and Changelog.
- Prefer the smallest complete scenario over a partial implementation or speculative infrastructure.
- A plan is not complete merely because it has steps; its milestone must be able to distinguish a real runnable result from a Mock.

---
name: plan-change
description: Create or revise an implementation-ready plan for a scoped repository change. Use when an approved requirement spans multiple steps, affects several project areas, needs risk analysis, or must be handed across sessions before implementation.
---

# Plan Change

Produce a short plan whose steps each end in a verifiable outcome.

## Workflow

1. Apply the task-level collaboration gate in `AGENTS.md` before substantive planning. Ask once whether to enable parallel Worktree + Subagent mode for this task; when approved and safely divisible, use `$run-parallel-worktrees`. Otherwise plan in the current worktree with one Agent. Do not inherit an earlier task's approval.
2. Read `docs/product_spec/README.md` and the latest dated Product Spec, `docs/project_status/README.md` and the latest dated Product Status, `docs/ENGINEERING_RULES.md`, `docs/adr/README.md`, the latest dated ADR, any older ADR explicitly referenced by it, and the repository areas implicated by the request.
3. Confirm the request is inside the approved scope. Route scope changes through `$define-product` before planning implementation.
4. Map current behavior and preserve existing user changes.
5. Define the exact in-scope and out-of-scope boundaries for this change. When parallel mode is approved, identify at least two independent work units, exact write ownership, dependencies, integration order, and checks; convert overlap to serial work.
6. Order steps by dependency. For each step, name the expected result and its verification.
7. Identify data-loss, compatibility, security, dependency, and rollback risks in proportion to the change.
8. Separate the development-loop gate from release acceptance. Require non-empty unit tests and change-related checks for implementation; schedule final artifacts, full smoke, Computer Use E2E, cross-platform candidates, archives, and human final review only for user-requested delivery acceptance, release preparation, or release-path changes.
9. Include any required file-boundary review, Chinese business-comment review, test organization, documentation synchronization, and approved-rule exception in the affected steps and completion criteria.
10. On the first real downstream plan, create `docs/work_plan/README.md` and today's `docs/work_plan/YYYYMMDD_work_plan.md`; otherwise update today's Work Plan and Product Status. When today's file does not exist and an earlier dated file exists, synthesize its still-valid content with today's changes into one complete current snapshot; update the existing same-day file instead of creating another. Confirm the approved requirement already has an entry in today's ADR; add or update the entry if planning resolves a consequential tradeoff.

## Plan Quality

- Use repository facts; do not invent file paths, commands, APIs, or dependencies.
- Prefer the smallest reliable change over speculative infrastructure.
- Include static checks and automated tests in the development loop; include production builds and real acceptance only at the approved delivery or release stage, or when directly affected by the change.
- Expose unresolved blockers rather than hiding them inside an implementation step.
- Keep one active plan; replace completed plan details only after results are recorded elsewhere.

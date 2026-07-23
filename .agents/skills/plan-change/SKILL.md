---
name: plan-change
description: Create or revise an implementation-ready plan for a scoped repository change. Use when an approved requirement spans multiple steps, affects several project areas, needs risk analysis, or must be handed across sessions before implementation.
---

# Plan Change

Produce a short plan whose steps each end in a verifiable outcome.

## Workflow

1. Read `docs/product_spec/README.md` and the latest dated Product Spec, `docs/project_status/README.md` and the latest dated Product Status, `docs/ENGINEERING_RULES.md`, `docs/adr/README.md`, the latest dated ADR, any older ADR explicitly referenced by it, and the repository areas implicated by the request.
2. Confirm the request is inside the approved scope. Route scope changes through `$define-product` before planning implementation.
3. Map current behavior and preserve existing user changes.
4. Define the exact in-scope and out-of-scope boundaries for this change.
5. Order steps by dependency. For each step, name the expected result and its verification.
6. Identify data-loss, compatibility, security, dependency, and rollback risks in proportion to the change.
7. Include any required file-boundary review, Chinese business-comment review, test organization, documentation synchronization, and approved-rule exception in the affected steps and completion criteria.
8. On the first real downstream plan, create `docs/work_plan/README.md` and today's `docs/work_plan/YYYYMMDD_work_plan.md`; otherwise update today's Work Plan and Product Status. When today's file does not exist and an earlier dated file exists, synthesize its still-valid content with today's changes into one complete current snapshot; update the existing same-day file instead of creating another. Confirm the approved requirement already has an entry in today's ADR; add or update the entry if planning resolves a consequential tradeoff.

## Plan Quality

- Use repository facts; do not invent file paths, commands, APIs, or dependencies.
- Prefer the smallest reliable change over speculative infrastructure.
- Include static checks, automated tests, build checks, and real acceptance only where applicable.
- Expose unresolved blockers rather than hiding them inside an implementation step.
- Keep one active plan; replace completed plan details only after results are recorded elsewhere.

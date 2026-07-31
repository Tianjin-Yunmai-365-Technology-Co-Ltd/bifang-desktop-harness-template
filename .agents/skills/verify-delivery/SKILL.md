---
name: verify-delivery
description: Accept or reject a complete real milestone artifact after every Todo in its batch is done, using approved scenarios and persistent smoke/E2E policy. Use for milestone acceptance, completion review, or before release preparation; reject Mock or incomplete results and route implementation gaps back to the Todo coding loop.
---

# Verify Delivery

Verify a complete milestone artifact, not a partial implementation or a collection of passing checks.

## Entry Gate

1. Read the latest dated Product Spec, `docs/AGENT_POLICY.md`, latest dated Work Plan, the latest dated ADR, `docs/ENGINEERING_RULES.md`, Verification and applicable interface/build rules.
2. Require every Todo in the candidate's batch to be `done` with non-empty unit/regression and related development evidence. If any Todo is non-`done`, stop milestone execution and return to `$implement-change`; do not run smoke/E2E.
3. Require a complete real artifact bound to the approved milestone, source commit, version/build identity and current environment. Reject source snippets, Mock, stub, placeholder, neutral scaffold, dev preview, assumed artifact path and internal-function-only evidence.

## Milestone Workflow

1. State the approved core success path, highest-risk failure path, real inputs/outputs and observable acceptance result. Separate external prerequisites from product logic.
2. Discover real repository commands and artifact locations; never invent them. Build/locate the candidate without running smoke/E2E in the build Skill.
3. Re-run current-candidate compile/build checks, non-empty unit/regression tests, required integration/contract checks and artifact existence. Zero tests or missing required-path coverage rejects the milestone unless an approved exception defines alternative evidence.
4. Resolve optional runtime checks in this order:
   - product, channel and safety hard requirements;
   - a stricter current-task user constraint;
   - `milestone_smoke` and `milestone_e2e` from `docs/AGENT_POLICY.md`;
   - applicability to the actual interface and artifact.
5. `enabled` means run when applicable; `disabled` means record `Not run` and residual risk unless a hard requirement overrides it. `pending`, missing/invalid policy, conflicting requirements, inability to establish that the artifact is runnable, or new credential/production/irreversible authority requires user input.
6. Run applicable smoke only against the real artifact with a bounded read-only entry. Call `$test-final-artifact-e2e` only here when E2E is enabled or required and a real artifact exists. A CI candidate transport bundle already marked `milestoneAcceptance: pending` may exist solely to move the candidate into this milestone; execute selected checks before collection as ready, release/distribution packaging, signing, release upload or publication.
7. Capture exact candidate, platform, commands/scenarios, expected/observed results, cleanup, skipped checks and unverified platforms. Do not infer cross-platform success.
8. Review maintained code against file boundaries and Chinese business-comment rules. Confirm Product Spec, design docs and `docs/changelog/YYYYMMDD_CHANGELOG.md` match the actual behavior.

## Rejection And Repair Loop

1. Reject the milestone when the artifact is missing/incomplete/not runnable, still contains Mock/scaffold behavior, deviates from an approved scenario, or any required/enabled check fails, times out, is cancelled or remains unrun.
2. Preserve failure evidence in `docs/VERIFICATION.md`.
3. For an approved-scope implementation gap, reopen or add a concrete Todo with the expected behavior and regression test, mark the milestone rejected, and immediately return to `$implement-change`. After repair, require the full batch to be `done` and rerun the complete milestone.
4. Route a newly discovered product boundary to `$define-product`; request approval for destructive operations or new external side effects. External unavailable platforms may remain `Unverified` only when they are outside the current milestone's required scope.
5. Never use `Partially verified` as an acceptance verdict while required product logic remains missing or wrong.

## Verdict

Use one milestone verdict:

- `Milestone accepted`: every required scenario and selected gate passed, and any required human review is recorded.
- `Awaiting human review`: automated evidence passed but the project requires an unsigned human verdict.
- `Milestone rejected`: a required condition failed; reopened Todo and repair routing are recorded.

Acceptance does not authorize tag, push, publication, signing, upload or destructive cleanup.

---
name: verify-delivery
description: Review delivery evidence for a repository change or release candidate and record it against product success criteria. Use when the user asks to verify delivery or completion, initiates a final-artifact build or release preparation, or a change directly affects the release path; only an explicit build/release request starts real release gates, and heavy acceptance remains separately selected.
---

# Verify Delivery

Distinguish evidence from assumptions and prevent unverified work from being reported as complete.

## Workflow

1. Read the relevant success criteria in the latest dated Product Spec indexed by `docs/product_spec/README.md`, `docs/ENGINEERING_RULES.md`, the latest dated Work Plan indexed by `docs/work_plan/README.md`, `docs/adr/README.md`, the latest dated ADR and its relevant historical references, and the verification matrix in `docs/VERIFICATION.md`. Read `docs/CLI_CONTRACT.md`, `docs/RUST_CLI_TEMPLATE.md`, and `docs/RELEASE.md` when a downstream release candidate is in scope.
2. Confirm the user requested delivery acceptance, completion review, a final-artifact build, or release preparation, or that the change directly affects the release path. If the request is implementation-only, return to `$implement-change` development-loop verification. Treat evidence-only review and release-path maintenance as inspection plus relevant static, unit, and isolated contract checks; they do not authorize real release builds, Computer Use E2E, packaging, collection, signing, upload, or publication.
3. Identify whether the deliverable is the documentation-only Harness template or an implemented downstream project, then inspect the actual change and its highest-risk behavior. For a downstream project, require its canonical Git top-level to equal the project root and record branch, source commit or unborn-HEAD state, and dirty status; a missing or inherited parent boundary is `Not verified`.
4. Discover verification commands from repository configuration and documentation. Never invent commands.
5. Identify the current operating system. For evidence-only review or release-path maintenance, run only the repository's relevant static, unit, and isolated contract checks and report missing release evidence. When the user explicitly initiates a final-artifact build or release preparation, run the mandatory release gates: repository-recorded compile/build validation, non-empty unit tests, change-required integration or contract checks, final-artifact existence, and read-only startup/smoke checks. For the Harness template, `python3 scripts/validate_harness.py` is always a relevant structural check; bundled release assets are built only in that explicit release stage. Heavy acceptance such as Computer Use E2E, full browser flows, host-driven MCP acceptance, or other interactive real-environment checks is never automatic here.
6. Test the core success path and any failure path that could cause data loss, false success, unsafe retry, or permission failure.
7. Confirm valid unit tests cover the core success path and the highest-risk failure path. Treat zero tests or either missing path as not verified unless an approved exception record defines an alternative.
8. Record each executed check with date, operating system, result, and meaningful output. When a heavy acceptance check was not explicitly selected for this task/run, record it as `Not run` plus residual risk instead of implying success. Mark other target platforms `Unverified`; never infer cross-platform success.
9. Allow diagnosis and repair inside the authorized task. Request human approval before destructive operations, scope changes, or new external side effects.
10. Validate the CLI JSON envelope, error structure, output streams, non-interactive behavior, and exit-code consistency when a CLI exists.
11. Review maintained code semantically against the approved file boundaries and Chinese business-comment requirements. Treat soft line thresholds as prompts, verify any retained over-threshold file has a recorded rationale, and do not use comment counts or character counts as evidence of quality.
12. Confirm the requirement has an ADR entry, relevant design documents reflect the implemented behavior, and actual user/maintainer-visible changes appear in today's `docs/changelog/YYYYMMDD_CHANGELOG.md`. Mark a document or check `Not applicable` only when the corresponding deliverable does not exist and record the reason; never use it to bypass a downstream required gate. Update `docs/VERIFICATION.md`, today's complete `docs/project_status/YYYYMMDD_product_status.md` snapshot, and relevant technical debt; when the Product Status date changes, synthesize the new file from the previous snapshot and current evidence. Prepare the evidence for human review, but never sign the reviewer field or mark the human verdict `Approved`.
13. When the current request explicitly initiates a final-artifact build or release preparation for a Rust CLI candidate, use `$build-rust-release` on the current platform and `$collect-release-artifacts` for produced or downloaded files. For TUI, MCP, GUI, or WEB, use the applicable adapter's recorded production build and artifact contract until a separately approved cross-interface release workflow exists. In evidence-only review, inspect existing artifacts instead of creating or collecting new ones. Call `$test-final-artifact-e2e` only when the current task/run explicitly enabled it or an approved product/channel requirement makes that acceptance mandatory; never auto-call it merely because `$verify-delivery` ran. Treat every selected heavy check as a required gate for that candidate: if it fails, times out, is cancelled, or is left unrun after selection, the candidate is `Not verified` and packaging, collection-as-ready, signing, upload, or publish readiness stays blocked. If a heavy check was not selected and no hard requirement demands it, keep the omission visible as `Not run` with residual risk. Verify archive/checksum/manifest agreement and require native test and smoke evidence for every platform claimed as verified.

## Completion Verdict

Use one verdict:

- `Verified`: all required success criteria have evidence and the repository contains a real human approval record.
- `Partially verified`: available checks pass, but named required evidence is missing.
- `Not verified`: a required check failed or the core result cannot be established.

Never equate compilation, test count, or a zero exit code alone with user acceptance. Report remaining risk alongside the verdict.
A user-selected heavy acceptance check counts as required evidence for that candidate even when similar checks are optional in other runs.

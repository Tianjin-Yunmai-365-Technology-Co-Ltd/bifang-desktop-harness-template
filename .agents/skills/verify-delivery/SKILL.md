---
name: verify-delivery
description: Verify a repository change or release candidate and record evidence against product success criteria. Use when checking whether work is complete, running acceptance, reviewing test coverage, validating a build, or preparing a truthful completion report.
---

# Verify Delivery

Distinguish evidence from assumptions and prevent unverified work from being reported as complete.

## Workflow

1. Read the relevant success criteria in the latest dated Product Spec indexed by `docs/product_spec/README.md`, `docs/ENGINEERING_RULES.md`, the latest dated Work Plan indexed by `docs/work_plan/README.md`, `docs/adr/README.md`, the latest dated ADR and its relevant historical references, and the verification matrix in `docs/VERIFICATION.md`. Read `docs/CLI_CONTRACT.md`, `docs/RUST_CLI_TEMPLATE.md`, and `docs/RELEASE.md` when a downstream release candidate is in scope.
2. Identify whether the deliverable is the documentation-only Harness template or an implemented downstream project, then inspect the actual change and its highest-risk behavior. For a downstream project, require its canonical Git top-level to equal the project root and record branch, source commit or unborn-HEAD state, and dirty status; a missing or inherited parent boundary is `Not verified`.
3. Discover verification commands from repository configuration and documentation. Never invent commands.
4. Identify the current operating system. For the Harness template, run `python3 scripts/validate_harness.py`, then validate bundled example assets. For a downstream project, run applicable checks from narrow and fast to broad and realistic: static checks, automated tests, build validation, artifact existence, artifact smoke test, then real acceptance.
5. Test the core success path and any failure path that could cause data loss, false success, unsafe retry, or permission failure.
6. Confirm valid unit tests cover the core success path and the highest-risk failure path. Treat zero tests or either missing path as not verified unless an approved exception record defines an alternative.
7. Record each executed check with date, operating system, result, and meaningful output. Mark other target platforms `Unverified`; never infer cross-platform success.
8. Allow diagnosis and repair inside the authorized task. Request human approval before destructive operations, scope changes, or new external side effects.
9. Validate the CLI JSON envelope, error structure, output streams, non-interactive behavior, and exit-code consistency when a CLI exists.
10. Review maintained code semantically against the approved file boundaries and Chinese business-comment requirements. Treat soft line thresholds as prompts, verify any retained over-threshold file has a recorded rationale, and do not use comment counts or character counts as evidence of quality.
11. Confirm the requirement has an ADR entry, relevant design documents reflect the implemented behavior, and actual user/maintainer-visible changes appear in today's `docs/changelog/YYYYMMDD_CHANGELOG.md`. Mark a document or check `Not applicable` only when the corresponding deliverable does not exist and record the reason; never use it to bypass a downstream required gate. Update `docs/VERIFICATION.md`, today's complete `docs/project_status/YYYYMMDD_product_status.md` snapshot, and relevant technical debt; when the Product Status date changes, synthesize the new file from the previous snapshot and current evidence. Prepare the evidence for human review, but never sign the reviewer field or mark the human verdict `Approved`.
12. For a Rust CLI release candidate, use `$build-rust-release` on the current platform and `$collect-release-artifacts` for produced or downloaded files. For TUI, MCP, GUI, or WEB, use the applicable adapter's recorded production build and artifact contract until a separately approved cross-interface release workflow exists. Verify archive/checksum/manifest agreement and require native test and smoke evidence for every platform claimed as verified.

## Completion Verdict

Use one verdict:

- `Verified`: all required success criteria have evidence and the repository contains a real human approval record.
- `Partially verified`: available checks pass, but named required evidence is missing.
- `Not verified`: a required check failed or the core result cannot be established.

Never equate compilation, test count, or a zero exit code alone with user acceptance. Report remaining risk alongside the verdict.

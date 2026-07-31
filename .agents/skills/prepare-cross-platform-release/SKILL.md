---
name: prepare-cross-platform-release
description: Prepare and validate opt-in native build automation for downstream Rust CLI milestone candidates across Windows, macOS, and Linux. Use when adding a CI build matrix or producing platform candidate archives with compile and non-empty test evidence; this Skill never runs smoke or E2E and does not mark candidates accepted.
---

# Prepare Cross-Platform Release

Generate native platform candidates and evidence without publishing or performing milestone runtime acceptance.

## Workflow

1. Read the approved Product Spec, active Todo/milestone Work Plan, `docs/AGENT_POLICY.md`, `docs/RUST_CLI_TEMPLATE.md`, `docs/RELEASE.md`, current version source and Verification.
2. Confirm every Todo in the current batch is `done`, repository root is an independent Git top-level, source commit is resolvable, and the user explicitly authorizes a manual CI candidate build. Do not infer authorization to publish.
3. Discover package/binary names, declared MSRV, target matrix and real commands. Require native Windows, macOS and Linux runners for claims about those systems.
4. Add one explicit manual `confirm_candidate_build` input. Do not add per-run smoke/E2E selection; runtime acceptance comes later from persistent project policy inside `$verify-delivery`.
5. Grant minimum read-only repository permissions. Pin third-party actions to reviewed immutable full commit SHAs.
6. On each native runner install the exact MSRV/components, run format/lint where applicable, machine-enforce a non-empty unit test suite, run locked release build and require the real candidate file. Do not launch it.
7. Package the produced file only as an unaccepted milestone candidate. Name it `<product>-v<version>-<platform>-<arch>.<ext>`, emit adjacent SHA-256 and a manifest containing version, source commit, platform, target, archive, digest, tests and `milestoneAcceptance: pending`.
8. Upload workflow artifacts for later milestone acceptance. Do not create tags, Releases, signatures, registry publications or external deployment.
9. Run local static/contract checks for the workflow and record unverified runner behavior. A candidate becomes collectable as ready only after matching `$verify-delivery` evidence proves its milestone accepted.

## Gates

- Fail when build authorization is absent, MSRV setup fails, tests are absent/fail, build fails, candidate is missing, version mismatches or checksum generation fails.
- Do not include smoke, E2E, real host interaction or Computer Use steps in this workflow.
- Do not infer native runtime behavior from compilation, packaging, another platform, emulation or cross-compilation.
- Packaging here creates a candidate transport, not an accepted release artifact. Any packaging change affecting runtime must be accepted as its own milestone before ready collection.

## Completion

Report workflow path, permissions/action pins, native matrix, source commit/version, non-empty tests, candidates/hashes/manifests, milestone status `pending`, skipped smoke/E2E, unverified runner execution and next `$verify-delivery` action.

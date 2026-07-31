---
name: prepare-release
description: Assess and prepare a traceable release using the repository's declared version scheme. Harness uses an Asia/Shanghai YYYYMMDDHHMM time version; downstream products use Semantic Versioning unless their approved specification says otherwise.
---

# Prepare Release

Prepare release metadata and evidence without publishing or tagging unless the user explicitly authorizes those mutations.

## Workflow

1. Read `Version.md` when it exists, `docs/RELEASE.md`, `docs/changelog/README.md`, all dated Changelog files contributing to the candidate version, `docs/product_spec/README.md` and the latest dated Product Spec, and the latest verification record.
2. Confirm the user intends to prepare a release. Require an already `Milestone accepted` candidate from `$verify-delivery`; development evidence, a build or a `pending` candidate is insufficient. Require the independent Git top-level and `HEAD` to match the accepted source commit. Inspect persistent smoke/E2E policy resolution and results, but do not run either test here.
3. Apply the declared scheme. For the Harness, generate a 12-digit `YYYYMMDDHHMM` value from the version-decision time in `Asia/Shanghai`; if another version already used that minute, wait for the next minute rather than inventing a suffix. For downstream SemVer products, recommend MAJOR for breaking behavior, MINOR for compatible capability, or PATCH for compatible fixes. Obtain the user's version decision before changing any version-bearing file.
4. Locate the declared version fact source and compare every version-bearing location. The Harness template uses root `Version.md` and its time-version scheme; a downstream Rust project uses root `Cargo.toml`, normally uses SemVer, and must not inherit the Harness `Version.md`. Stop if the relevant fact source has not been designated.
5. Consolidate meaningful `Unreleased` entries from the dated Changelog files into a dated version section without creating a root-level Changelog or duplicating entries across date files. Retain a fresh `Unreleased` section in today's Changelog when further work is expected.
6. Require `$collect-release-artifacts` to refresh `<project-root>/release` only from builds whose exact candidate identity has accepted milestone evidence. Validate archives/binaries, SHA-256, manifests, version, commit, build, tests, milestone verdict and any policy-selected smoke/E2E result; reject historical, stale, pending, foreign, ambiguous or extra files.
7. Update release and project status records with evidence and known issues.

## Release Gate

Declare `Ready` only when all required checklist items in `docs/RELEASE.md` are satisfied. Otherwise declare `Not ready` and list exact blockers.

- Never overwrite a published version.
- Never fabricate a tag, commit, checksum, artifact, date, or validation result.
- Never publish, push, tag, or upload solely because this skill was invoked; require explicit user authorization.
- Never treat a successful candidate workflow or complete artifact directory as authorization to publish it.
- Never run smoke/E2E from release preparation or treat an unselected check as passing. Preserve `Not run` with residual risk and block readiness when policy/product/channel made a check required.
- Never assess an old `release/` snapshot as current merely because its files exist; collection must bind it to the selected version, source commit and build/run evidence.
- Never change a Harness time version or downstream SemVer value solely because the calculated next value appears obvious; the user owns the version decision.
- Describe changes in user language rather than as a raw commit list.

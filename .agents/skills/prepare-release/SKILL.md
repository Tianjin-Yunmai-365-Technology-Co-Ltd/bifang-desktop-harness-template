---
name: prepare-release
description: Assess and prepare a traceable Semantic Versioning release for this repository. Use when choosing the next version, updating release notes, checking version consistency, validating artifacts, or deciding whether a release candidate is ready to publish.
---

# Prepare Release

Prepare release metadata and evidence without publishing or tagging unless the user explicitly authorizes those mutations.

## Workflow

1. Read `Version.md` when it exists, `docs/RELEASE.md`, `docs/changelog/README.md`, all dated Changelog files contributing to the candidate version, `docs/product_spec/README.md` and the latest dated Product Spec, and the latest verification record.
2. Confirm the user explicitly intends to prepare a release. Re-run the full current-source acceptance through `$verify-delivery`; development-loop evidence alone cannot satisfy release success criteria. For a downstream project, require its project root to be the independent Git top-level and require `HEAD` to resolve to the source commit used by candidate evidence; an unborn HEAD cannot become release-ready. Confirm the current run recorded release-stage gate selection before build/package start: compile/build, non-empty unit tests, relevant integration or contract checks, artifact existence, and read-only smoke are mandatory; heavy acceptance defaults to `Not run` unless explicitly selected or hard-required by product/channel rules.
3. Recommend a version bump from user-visible compatibility: MAJOR for breaking behavior, MINOR for compatible capability, PATCH for compatible fixes. Obtain the user's version decision before changing any version-bearing file.
4. Locate the declared version fact source and compare every version-bearing location. The Harness template uses root `Version.md`; a downstream Rust project uses root `Cargo.toml` and must not inherit the Harness `Version.md`. Stop if the relevant fact source has not been designated.
5. Consolidate meaningful `Unreleased` entries from the dated Changelog files into a dated version section without creating a root-level Changelog or duplicating entries across date files. Retain a fresh `Unreleased` section in today's Changelog when further work is expected.
6. Require `$collect-release-artifacts` to refresh `<project-root>/release` from the user's latest completed current-project builds before readiness assessment. Do this only after the same candidate has passed mandatory release gates and any selected or hard-required heavy acceptance checks. Validate that this directory contains exactly the current selected archives/binaries, adjacent SHA-256 files, manifests and declared evidence; reject historical, stale, foreign-project, ambiguous or extra files. Validate standard names, target platform/architecture, source commit, build run, test result, native smoke result, and any selected heavy-acceptance result.
7. Update release and project status records with evidence and known issues.

## Release Gate

Declare `Ready` only when all required checklist items in `docs/RELEASE.md` are satisfied. Otherwise declare `Not ready` and list exact blockers.

- Never overwrite a published version.
- Never fabricate a tag, commit, checksum, artifact, date, or validation result.
- Never publish, push, tag, or upload solely because this skill was invoked; require explicit user authorization.
- Never treat a successful candidate workflow or complete artifact directory as authorization to publish it.
- Never treat an unselected heavy acceptance check as passing evidence. Record optional omissions as `Not run` with residual risk, and block readiness when product or channel rules made that check mandatory.
- Never assess an old `release/` snapshot as current merely because its files exist; collection must bind it to the selected version, source commit and build/run evidence.
- Never raise or otherwise change the version solely because the calculated Semantic Versioning category appears obvious; the user owns the version decision.
- Describe changes in user language rather than as a raw commit list.

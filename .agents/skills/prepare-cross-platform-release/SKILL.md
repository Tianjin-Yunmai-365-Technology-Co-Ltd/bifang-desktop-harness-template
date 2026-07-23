---
name: prepare-cross-platform-release
description: Prepare and validate opt-in native release automation for a downstream Rust CLI across Windows, macOS, and Linux. Use when adding a CI build matrix, producing platform archives, collecting per-platform tests and smoke evidence, or preparing a cross-platform release candidate without publishing it.
---

# Prepare Cross-Platform Release

Create native platform evidence while keeping publishing as a separate, explicitly authorized action.

## Workflow

1. Read the approved product scope, `docs/RELEASE.md`, `docs/VERIFICATION.md`, `docs/RUST_CLI_TEMPLATE.md`, and the repository's real Cargo metadata.
2. Confirm CI and cross-platform packaging are in scope. If not, route the request through `$define-product` and record the decision before adding automation.
3. Adapt `assets/github-release-candidate.yml` to the binary name derived by `docs/RUST_CLI_TEMPLATE.md` and confirmed by Cargo metadata, plus the repository's real commands. Do not ask for an independent binary name. Update the `RUSTUP_TOOLCHAIN` env value to match the downstream project's actual declared `rust-version` in its root `Cargo.toml`; never leave the template's example toolchain version in place. Preserve the native Windows, macOS, and Linux matrix; add architectures only when runners/toolchains and user demand justify them.
4. Pin action versions to reviewed major versions, grant read-only repository permissions, and avoid secrets for candidate builds. Do not add a publish or release-creation step by default.
5. Make every platform install and select the declared MSRV, including required rustfmt/clippy components, then run formatting/lint, a machine-enforced non-empty test suite, a locked release build, final-binary existence check, and a real read-only smoke test with an explicit timeout.
6. Package only end-user files. Name archives `<product>-v<version>-<platform>-<arch>.<ext>` and emit an adjacent `.sha256` plus a machine-readable manifest containing version, source commit, platform, architecture/target, archive name, digest, tests, and smoke result.
7. Upload each platform bundle as a workflow artifact. Retain raw logs or test reports only when the repository actually produces them.
8. Run the workflow only when authorized and a version candidate has been chosen. Record the workflow run, commit, runner images, results, and unverified combinations.
9. Use `$collect-release-artifacts` to retrieve the selected latest completed run, safely clear historical contents from the project-root `release/` directory, and copy only current-project results there. Then use `$verify-delivery` for the release gate and `$prepare-release` for version/changelog readiness.

## Required Failure Behavior

- Fail the platform job when the declared MSRV cannot compile the project, tests are absent, the build fails, the binary is missing, smoke fails/times out, the version mismatches, or checksum generation fails.
- Do not publish partial matrices as a complete cross-platform release. Preserve successful artifacts as diagnostic evidence and mark the candidate failed.
- Never infer one platform from another or treat an emulated/cross-compiled file as natively smoke-tested.
- Do not create tags, releases, uploads to public registries, signatures, or attestations without separate authorization and configured trust material.

## Template Boundary

The bundled workflow is an example asset. Copy and adapt it only into an implemented downstream repository after the scope gate; do not install it into the Harness root as active CI.

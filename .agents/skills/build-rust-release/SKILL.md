---
name: build-rust-release
description: Build a downstream Rust library-and-CLI workspace reproducibly for the current host or an explicitly configured target and locate the real binary without running smoke or E2E. Use when a completed Todo needs a milestone candidate, for release builds, artifact-path discovery, or diagnosing a missing Rust artifact.
---

# Build Rust Release

Build one real candidate at a time and keep build evidence separate from milestone acceptance.

## Workflow

1. Read `Cargo.toml`, `docs/RUST_CLI_TEMPLATE.md`, Verification and the active Todo/milestone Work Plan. Discover package and binary names from Cargo metadata.
2. Require the downstream project root to be its independent Git top-level and `HEAD` to resolve to the candidate source commit. Confirm `Cargo.lock`, `rust-version`, host, architecture, branch and dirty state.
3. Require the current build Todo and its dependencies to be `done`. Run repository-recorded format, lint and non-empty test commands before the release build; zero tests fails.
4. Build with the repository's real command. For the default template use `cargo build --release --locked --workspace`; add an explicit target only when its linker/toolchain is configured.
5. Resolve the output root from Cargo configuration or `CARGO_TARGET_DIR`, locate the declared binary and validate regular-file existence, size, platform and version metadata. Do not infer paths from repository folder names.
6. Record exact artifact path, size, platform, target, version, source commit and build command in Verification.
7. Do not launch the binary, run smoke/E2E, package, collect, sign, upload, tag, publish or change versions. Hand the artifact identity to `$verify-delivery` when the full Todo batch is ready for milestone acceptance.

## Boundaries

- A produced binary is a milestone candidate, not an accepted or verified release.
- A local build proves only the current toolchain/target; mark other platforms `Unverified`.
- If a target cannot run on the current host, record that fact for milestone applicability; do not substitute file existence for runtime evidence.
- Use `$prepare-cross-platform-release` for a configured candidate matrix and `$collect-release-artifacts` only after milestone evidence permits collection as ready.

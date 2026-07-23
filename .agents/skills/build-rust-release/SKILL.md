---
name: build-rust-release
description: Build a downstream Rust library-and-CLI workspace reproducibly for the current host or an explicitly configured target, locate the real final binary, smoke-test it, and record build evidence. Use for release builds, artifact-path discovery, or diagnosing a missing Rust release binary.
---

# Build Rust Release

Build one platform at a time and distinguish a produced binary from a verified release.

## Workflow

1. Read `Cargo.toml`, `docs/RUST_CLI_TEMPLATE.md`, `docs/VERIFICATION.md`, and the active plan. Discover the CLI package and binary names from Cargo metadata; never infer them from the directory name.
2. Require the downstream project root to be its independent Git top-level and require `HEAD` to resolve to a real source commit for release evidence. Confirm `Cargo.lock` exists and the installed toolchain is not older than `rust-version`. Record `rustc -vV`, `cargo --version`, host OS, architecture, source commit, branch, and whether the worktree is dirty. When claiming MSRV compatibility, repeat the required checks with the exact declared MSRV; a newer compiler is insufficient evidence.
3. Run the repository-recorded formatting, lint, and test commands before a release build. Treat zero tests or missing required-path coverage as a failed gate.
4. Build with the repository's real command. For the default template use `cargo build --release --locked --workspace`; add `--target <triple>` only when the target and linker are explicitly configured.
5. Resolve the output root from Cargo configuration or `CARGO_TARGET_DIR`. Locate the declared binary in `target/release` for a host build or `target/<triple>/release` for a target build. Require `.exe` only for Windows.
6. Invoke the real binary with the recorded read-only smoke command and timeout. Verify `--version` matches the workspace version.
7. Record the exact binary path, size, platform, architecture/target, version, source commit, build command, smoke command, and result in `docs/VERIFICATION.md`. Do not copy it into a candidate directory here.

## Boundaries

- A local build verifies only the current host unless a configured cross-toolchain actually produced and ran the target artifact.
- Do not package, sign, upload, tag, publish, or modify versions in this skill.
- Do not copy Cargo intermediates such as `deps`, `incremental`, `.d`, or build-script output into release results.
- If a target binary cannot run on the current host, mark its smoke status `Unverified`; never substitute file existence for execution.

## Result

Hand the verified binary path and build identity to `$collect-release-artifacts`, which safely refreshes the project-root `release/` directory. Use `$verify-delivery` for the full pre-release gate and `$prepare-cross-platform-release` when Windows, macOS, and Linux evidence is required.

---
name: collect-release-artifacts
description: Retrieve, safely refresh, consolidate, and validate the current downstream project's latest completed release result files in the project-root release directory. Use after local or CI builds, when downloading workflow artifacts, or when preparing a release candidate for human review.
---

# Collect Release Artifacts

Create one reviewable current release-candidate directory without rebuilding or publishing.

## Workflow

1. Read `docs/RELEASE.md`, the relevant verification record, and every user-supplied completed build/run result. Require the canonical Git top-level to equal the current project root. Determine the current project identifier, version, source commit, expected platform/architecture matrix, binary name, archive names, checksums and evidence before touching the destination.
2. Retrieve artifacts through the repository's configured provider or accept user-supplied local result directories. For every expected platform/architecture and artifact class, select the latest completed result that matches the current project, version, source commit and explicit build/run identity. Never interpret a provider's ambiguous “latest”, filesystem mtime alone, another project, another commit, an incomplete run or an unverified directory as the selected result; stop on ambiguity.
3. Build and validate the complete source manifest before cleanup. Require every source file to exist, be a regular file, remain outside the destination, and match the declared project/version/commit/run metadata. Reject missing, extra, duplicate, empty, stale, cross-project or colliding filenames.
4. Resolve the destination as exactly `<canonical-project-root>/release`. Reject a symlink at `release`, any canonical escape from the project root, a destination equal to the project root, or any unresolved/broad target. Create the directory when absent. Immediately before copying, enumerate and remove every existing entry inside that exact directory so no historical result survives; this user-authorized cleanup applies nowhere else.
5. Copy only the selected current source-manifest files directly into `release/`. Flatten provider wrapper directories only after filename collision checks. Keep only declared end-user binaries or archives, adjacent checksum files, manifests, and explicitly required verification evidence.
6. Recompute every archive SHA-256 locally and compare it with both the adjacent checksum file and manifest. Validate that every manifest agrees on project, version, source commit and build/run identity and that each required platform/architecture appears exactly once.
7. Inspect archive contents without executing foreign-platform binaries; reject absolute paths, parent traversal, or unexpected payloads. Execute a read-only smoke test only for binaries compatible with the current host. Preserve CI-native smoke evidence for other platforms and label it as CI evidence, not local execution.
8. Re-enumerate `release/` and require exact equality with the selected source manifest: no historical, temporary, undeclared or partial file may remain. Write or update release evidence in `docs/VERIFICATION.md`: cleanup inventory, source runs, commit, copied files, sizes, hashes, platform results, local checks, CI checks, missing combinations and remaining risks.

## Output Contract

The project-root `release/` directory contains only the current project's latest selected:

- one archive per declared platform/architecture;
- one adjacent `<archive>.sha256` per archive;
- one manifest per platform or one aggregate manifest with equivalent fields;
- optional test/log evidence named and referenced by the manifest.

Never include Cargo intermediates, credentials, absolute local paths, caches, or unredacted environment dumps.

## Boundaries

- Collection does not prove the build was trustworthy and does not replace `$verify-delivery`.
- Do not publish, upload, sign, tag, or change version files.
- Never clean or write outside the exact non-symlink `<canonical-project-root>/release` directory. Resolve and validate both the destination and complete source manifest before deleting historical contents.
- Cleanup is intentional and destructive: old release candidates in `release/` are removed on every collection and are not preserved by this Skill.
- If any expected result is missing or inconsistent, preserve the evidence, mark the candidate incomplete, and stop before release preparation can report `Ready`.

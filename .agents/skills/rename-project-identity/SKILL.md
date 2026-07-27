---
name: rename-project-identity
description: Rename an initialized or newly instantiated project's display name and product prefixes across maintained configuration, source paths, documentation, project Skills, and the two root licenses. Use during downstream instantiation, an approved product rename, or when residual template/sample identity must be removed repository-wide.
---

# Rename Project Identity

Apply one auditable identity mapping across the canonical project root. Replace identity tokens only; never rewrite license rights, historical verification results, third-party notices, generated artifacts, or unrelated prose.

## Required Inputs

- canonical project root;
- old and new display names;
- old and new ASCII `snake_case` project identifiers;
- old and new lowercase kebab-case prefixes;
- any additional exact prefix mappings required by real configuration, such as an application identifier or environment-variable prefix.

## Workflow

1. Read `AGENTS.md`, the current product identity source, `docs/ENGINEERING_RULES.md`, current Product Status, current Work Plan when present, latest ADR when present, both root licenses, and the files reported by an exact old-name search.
2. Confirm that the rename is approved. During `$instantiate-project`, the identity supplied by the user is approval for resetting copied Harness identity. For an existing product, route an unapproved identity change through `$define-product` and `$plan-change` before writing.
3. Resolve the canonical project root and inspect Git top-level, branch, commit state, remotes, and `git status --short`. Preserve existing changes and stop when overlapping edits cannot be reconciled.
4. Run the bundled script without `--apply` first. Supply all three standard identity forms and each known extra exact mapping. Review the JSON plan, especially collisions, skipped binary files, excluded paths, License edits, Skill edits, and path renames.

   ```text
   python3 .agents/skills/rename-project-identity/scripts/rename_project_identity.py \
     --root <project-root> \
     --old-display-name <old-name> --new-display-name <new-name> \
     --old-id <old_snake_case> --new-id <new_snake_case> \
     --old-kebab <old-kebab> --new-kebab <new-kebab>
   ```

5. Reject collisions, path escapes, symlinks, undecodable maintained text that contains an identity, ambiguous partial prefixes, or a mapping that would change third-party or generated content. Excluded directories are `.git`, build/cache/output directories, dependency stores, and root `release/`; do not weaken these exclusions to force a clean result.
6. Re-run the reviewed command with `--apply`. The script replaces text first, then renames files and directories deepest-first. For an approved existing-project identifier change, add `--rename-root` only when the canonical root basename equals the old identifier; the script rejects an existing sibling destination. A newly instantiated target already has the new basename and must not use this option. The script updates `LICENSE.zh-CN.md` and `LICENSE.en.md` only by exact identity substitution; any legal wording change requires separate approval and bilingual legal review.
7. Search the entire maintained tree for every old token and common sample identities. Resolve every applicable residual. Intentional generic examples must not reuse the real old project identity; rewrite them as explicit placeholders instead of allowlisting silent residue.
8. Run affected formatters, parsers, tests, builds, Skill validation, local-link checks, and the repository validator. For Rust, regenerate `Cargo.lock` with Cargo when package/path names changed; do not hand-edit checksums. For a Harness change, run `python3 scripts/validate_harness.py`.
9. Synchronize current product identity, Product Status, Work Plan, ADR, verification evidence, Changelog, release naming, GUI application profile, package metadata, and retained Skills. Do not falsify immutable evidence: when historical command output contains the old name, preserve the quoted evidence and add an explicit identity-history note rather than rewriting the observed result.
10. Inspect the final diff and report changed content, renamed paths, exclusions, remaining old-name hits, checks executed, unverified platforms, and rollback instructions. Do not commit, tag, push, publish, or modify external systems without separate authorization.

## Invariants

- `LICENSE.zh-CN.md` and `LICENSE.en.md` name the current project consistently while retaining equivalent legal terms and the Chinese-control rule.
- Project-owned configuration, package/crate names, application identifiers, Skills, current documentation, release prefixes, and maintained source paths contain no stale product prefix.
- `.git`, dependencies, generated output, caches, vendored third-party content, and `release/` are not bulk-edited.
- No destination path is overwritten and no symlink is followed.
- A display-name change does not silently change the ASCII project identifier, application identifier, legal entity, version, product scope, or release authorization.

## Completion

Report the exact mapping, dry-run and apply summaries, License/Skill coverage, renamed paths, residual-search result, validation evidence, existing user changes preserved, and any identity form that remains `Unverified`.

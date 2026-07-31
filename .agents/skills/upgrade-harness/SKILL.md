---
name: upgrade-harness
description: Safely update the Harness-owned engineering rules, retained project Skills, and maintenance tooling in an initialized downstream project without overwriting product code, project memory, identity, policy, licenses, or local decisions. Use when a user asks to upgrade, sync, migrate, refresh, or compare a downstream project's Harness engineering layer against an explicitly supplied newer Harness source.
---

# Upgrade Harness

Update one terminal downstream project through an auditable preview, conflict-resolution, apply, verification, and baseline-recording loop.

## Workflow

1. Read the downstream `AGENTS.md`, `docs/AGENT_POLICY.md`, latest Product Spec, Product Status, Work Plan and ADR when present, `docs/ENGINEERING_RULES.md`, `docs/TECH_DEBT.md`, and `.harness/upstream-lock.json` when present. Read the source Harness `Version.md`, latest Product Spec/Status/ADR, and its validation command.
2. Require the user to identify the source Harness root when it cannot be discovered unambiguously. Resolve source and downstream roots to distinct canonical absolute paths. Require each existing Git repository's top-level to equal its declared root; reject symlink roots, nested ambiguity, a source equal to the target, and paths outside the declared roots.
3. Read [references/ownership-policy.md](references/ownership-policy.md) and use [references/ownership-manifest.json](references/ownership-manifest.json). Treat the manifest as a minimum protection policy, not permission to copy every matching source file.
4. Inspect the downstream's selected interfaces, identity mapping, retained Skills, approved exceptions, and persistent Agent policy. Build a task-local candidate tree containing only engineering files applicable to that downstream. Exclude every `protected` or `tombstone` source path. Render the downstream display name, identifiers, paths, selected adapters and other approved identity differences in the candidate; a raw Harness source tree is never a valid candidate tree.
5. Require the source Harness Git worktree to be clean and its existing `HEAD` to match the declared source commit; require the declared source version to match source `Version.md`. Run the source Harness validator before trusting its candidates. Do not copy that template-only validator into the downstream. Record source version, source commit, candidate construction inputs, downstream branch/commit/dirty-state digest, and unverified platforms.
6. Generate a read-only plan:

   ```text
   python3 .agents/skills/upgrade-harness/scripts/harness_upgrade.py plan \
     --source-root <clean-harness-source-root> \
     --source-version <harness-version> \
     --source-commit <harness-source-head> \
     --candidate-root <rendered-candidate-root> \
     --target-root <downstream-root> \
     --ownership .agents/skills/upgrade-harness/references/ownership-manifest.json \
     --lock <downstream-root>/.harness/upstream-lock.json \
     --output <new-plan-path-outside-candidate-and-target.json>
   ```

   The output path must not exist and must remain outside both trees. Omitting `--output` prints JSON without writing.
7. Review every classification. Only `update` on an existing `managed`/`managed-self` file whose content and ordinary permission mode still match its baseline is auto-applicable. `add`, `manual_add`, and `delete` require explicit manual file work followed by a new plan; the updater never creates or unlinks project files. `preserve_local` remains anchored to its old target baseline so a later upstream change becomes a conflict instead of overwriting the local decision. `manual_merge` requires a section-aware merge. `conflict`, `collision`, ownership-mode drift, protected/tombstone candidate content, path escape, special permission bits, special files, junctions, or relevant symlinks block completion.
8. When the lock is absent, perform a bootstrap audit. Treat every overlapping managed or mixed-ownership file as a conflict; do not infer a common ancestor. Make each managed overlap converge byte-for-byte and mode-for-mode, resolve mixed paths explicitly, generate a new reviewed plan, then establish the first baseline:

   ```text
   python3 .agents/skills/upgrade-harness/scripts/harness_upgrade.py record \
     --plan <reviewed-bootstrap-plan.json> \
     --source-version <harness-version> \
     --source-commit <harness-source-commit> \
     --bootstrap \
     --approval bootstrap-verified-baseline
   ```

   Bootstrap never waives a symlink/special-file problem, protected/tombstone path, divergent managed overlap, or unreviewed mixed path.
9. Convert the approved upgrade into the current Work Plan's TodoList. Use `docs/AGENT_POLICY.md` to decide whether parallel Worktree/Subagent execution is applicable; do not ask again when the policy and task facts are sufficient. Keep mixed-ownership files serial.
10. After the user approves the dry-run, apply only safe managed actions:

    ```text
    python3 .agents/skills/upgrade-harness/scripts/harness_upgrade.py apply \
      --plan <task-plan.json> \
      --approval apply-managed-changes \
      --path <one-reviewed-update-path>
    ```

    The command rebuilds the plan from the exact target-owned ownership manifest and `.harness/upstream-lock.json`, binds source and target Git identity, compares the complete reviewed JSON, preflights every action, and atomically replaces exactly one existing file. Generate and review a new plan after every applied path. Normal `managed` updates must finish before `managed-self`; within self-update paths the CLI enforces a stable order and replaces its entrypoint last. Plan tampering or any source/candidate/target/control-file drift aborts before the write. Resolve `add`, `manual_add`, `delete`, `merge-sections`, and `conditional` items separately with `apply_patch`; never replace an entire mixed-ownership file merely to avoid a merge.
11. Run non-empty unit tests plus affected format, lint, static, integration and contract checks. Do not run smoke or E2E during the upgrade Todo loop. When all Todo items are `done`, hand the complete real milestone candidate to `$verify-delivery`, which alone decides milestone smoke/E2E from persistent policy, hard requirements and applicability.
12. Re-run `plan`. Resolve every blocker and unapplied managed action. Record the verified baseline only after the target contains the reviewed result:

    ```text
    python3 .agents/skills/upgrade-harness/scripts/harness_upgrade.py record \
      --plan <newly-reviewed-converged-plan.json> \
      --source-version <harness-version> \
      --source-commit <harness-source-commit> \
      --approval record-verified-baseline
    ```

    Repeat `--resolved-manual <path>` for every remaining reviewed `manual_merge` classification. The exact set must match the plan; otherwise record fails. A `manual_add` must first create the target and produce a newly reviewed converged plan. Never record a pending `add`/`manual_add`/`delete`/`update`, blocker, changed plan, or unreviewed mixed path.
13. Re-run the upgraded updater's tests and plan after any `managed-self` update. Update downstream project memory with the source, plan, conflicts, applied paths, preserved paths, checks, unresolved risk and lock result. Do not import the source Harness's Product Spec, Status, Plan, ADR, Changelog, Verification, Tech Debt or approval history.

## Safety Boundaries

- Default to `plan`; never write merely because the Skill was invoked.
- Never overwrite product source, tests, Cargo product version/lock choices, project memory, project identity, selected interfaces, GUI identity, persistent Agent policy, licenses, Git configuration/history, remote, branch, tag, Worktree, secrets, or unregistered local files.
- Never restore `Version.md`, `$instantiate-project`, `$initialize-rust-project`, template validator files, `docs/HARNESS_ENGINEERING.md`, or another active derivation route to a terminal downstream.
- Never auto-apply `merge-sections`, `conditional`, `protected`, unknown, or conflicted paths.
- The updater never automatically adds or deletes project files. A reviewed `add`/`delete` is executed manually inside the declared Todo, then a new plan must show convergence before recording.
- Do not update `.harness/upstream-lock.json` before implementation and verification finish. The lock records Harness provenance; it is not a second product-version source.
- If identity rendering, ownership, shared ancestry, required external authority, or a conflict cannot be determined, stop and ask the user.

## Completion

Report source and target identities, baseline state, dry-run classifications, approved and applied paths, preserved local changes, conflicts, tests, milestone acceptance status, lock update, unverified platforms and remaining risk. A successful dry-run alone is not a completed upgrade.

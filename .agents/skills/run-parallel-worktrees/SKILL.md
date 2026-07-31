---
name: run-parallel-worktrees
description: Coordinate an implementation Todo batch across visible Subagents using isolated Git worktrees and codex/ branches. Use when the downstream project's persistent policy enables Worktree/Subagent execution and at least two write scopes are safely independent; also use to inspect or conservatively retire worktrees created by this workflow.
---

# Run Parallel Worktrees

Execute one Todo batch as visible isolated work units without losing user changes or leaving required work in the background.

## Policy And Applicability

1. Read `docs/AGENT_POLICY.md`. Continue only when `parallel_worktree_subagents: enabled`; use single Agent when disabled. If the field is missing, invalid or `pending` in an initialized downstream, ask once and persist the user's project-level choice.
2. `enabled` is permission, not a requirement. Use this Skill only when at least two active Todo have non-overlapping write ownership, a defined integration order and a clean committed Git baseline. Otherwise choose single Agent without asking again.
3. Product definition, planning, read-only investigation, ordinary evidence review, builds, collection and release metadata do not become parallel merely because the preference is enabled.
4. Policy permission does not authorize commit, merge, deletion, push, publication, credentials or external effects beyond the original task.

## Preparation

1. Read the Product Spec, active Todo/milestone Work Plan, latest ADR, engineering rules and implicated files.
2. Define each unit with Todo IDs, outcome, owned files/modules, dependencies, verification and integration order. Convert overlapping writes to serial work.
3. Publish the unit map and proposed `codex/<task>/<unit>` branches before creation.
4. Run the helper from the exact project root:

   ```text
   python3 .agents/skills/run-parallel-worktrees/scripts/parallel_worktrees.py create --project-root <absolute-project-root> --task <task> --unit <unit>
   ```

   The helper requires an independent Git top-level and clean committed baseline. Never auto-stash or auto-commit user changes.
5. Before a writing Subagent edits or stages, run from its exact Worktree:

   ```text
   python3 <absolute-project-root>/.agents/skills/run-parallel-worktrees/scripts/parallel_worktrees.py guard --project-root <absolute-project-root> --task <task> --unit <unit> --write-target <owned-path>
   ```

   Repeat `--write-target` for every owned path. The guard checks cwd, Git root, registered Worktree, branch and resolved target boundaries but does not replace the host sandbox.
6. Tell every writing Subagent that others are active, it owns only declared paths, must preserve others' changes, must not widen scope, and must return changed files, development checks, blockers and integration notes.

## Visible Execution And Integration

1. Publish concise status at start, block, phase completion, integration and verification. Wait synchronously for every required result.
2. Stop or redirect units when scope, ownership or safety assumptions change. Do not silently create replacement agents.
3. Inspect each diff and evidence. Reject unrelated edits, missing tests, stale comments, secrets, absolute local paths and unsupported claims.
4. Integrate in dependency order with reversible Git operations. Resolve semantic conflicts serially; never let multiple Subagents race.
5. Run non-empty unit/regression tests and related format, lint, static, integration or contract checks after integration. Do not run smoke/E2E during Todo implementation.
6. Mark Todo `done` only after integrated development checks pass. When the whole batch is `done`, return the real candidate to `$verify-delivery`.

## Conservative Retirement

Inspect before cleanup:

```text
python3 .agents/skills/run-parallel-worktrees/scripts/parallel_worktrees.py inspect --project-root <absolute-project-root>
```

Remove only an exact clean workflow-owned Worktree whose branch is already an ancestor of the named integration ref:

```text
python3 .agents/skills/run-parallel-worktrees/scripts/parallel_worktrees.py remove --project-root <absolute-project-root> --task <task> --unit <unit> --integrated-into <ref>
```

The helper retains the branch. Never force-remove a dirty, missing, mismatched or unintegrated unit.

---
name: run-parallel-worktrees
description: Coordinate an explicitly approved coding or implementation task across visible Subagents using isolated Git worktrees and codex/ branches. Use only after the user approves parallel Worktree + Subagent mode for the current code/implementation task and at least two write scopes can be separated safely; also use to inspect or conservatively retire worktrees created by this workflow.
---

# Run Parallel Worktrees

Execute one approved task as visible, isolated work units without leaving required Subagent work in the background.

## Authorization Gate

1. Before substantive code or implementation work, ask once whether to enable parallel Worktree + Subagent mode. Do not inherit approval from another task.
2. Do not ask during product definition, scope design, implementation planning, documentation-only maintenance, pure Q&A, read-only investigation, verification review, build, release preparation, delivery work, or an immediate safety action needed to prevent harm.
3. Use the single-Agent current-worktree path when the user declines, does not answer, or the task cannot be split into at least two independent scopes.
4. Treat approval as permission to prepare local Worktrees and invoke Subagents for this task only. It does not authorize commit, merge, deletion, push, publication, credentials, or new external effects beyond the original task.

## Preparation

1. Read the current Product Spec, Work Plan, latest ADR, engineering rules, and implicated files.
2. Define each work unit with a concrete outcome, owned files or modules, dependencies, verification, and integration order. Convert overlapping write ownership to serial work.
3. Show the user the work-unit map and the proposed `codex/<task>/<unit>` branches before creating anything.
4. Run the helper with an explicit project root, task identifier, and unit identifier:

   ```text
   python3 .agents/skills/run-parallel-worktrees/scripts/parallel_worktrees.py create --project-root <absolute-project-root> --task <task> --unit <unit>
   ```

   The helper requires an independent Git top-level and a clean, committed baseline. If it blocks, report the reason and ask the user how to handle their changes; never auto-stash or auto-commit.
5. Run `create`, `inspect`, and `remove` from the exact project root. Before a writing Subagent edits or stages declared targets, run the guard from the exact unit Worktree and pass each target with a repeated `--write-target`:

   ```text
   python3 <absolute-project-root>/.agents/skills/run-parallel-worktrees/scripts/parallel_worktrees.py guard --project-root <absolute-project-root> --task <task> --unit <unit> --write-target <owned-path>
   ```

   The guard fails closed unless the process `cwd`, registered Worktree, Git top-level, current branch, and resolved write targets match the unit identity. It catches helper misuse and path or symlink escape, but does not claim to replace a Codex-host sandbox or prevent writes that bypass the helper entirely.
6. Assign each writing Subagent only its prepared Worktree and declared ownership. Tell it that other agents are working concurrently, it must preserve others' changes, must not widen scope, and must return changed files, checks, blockers, and integration notes. Read-only Subagents may omit a Worktree when they cannot write.

## Visible Foreground Execution

1. Publish a user-visible update when each Subagent starts, blocks, completes a phase, or returns a result. Include the unit name and observable status, not hidden reasoning.
2. Wait synchronously for every required Subagent result. Do not finish the main task while required work remains running or queued in the background.
3. If a wait lasts longer than the host's useful update interval, report that the unit is still running and continue bounded waits. Surface approval or user-input requests instead of answering them on the user's behalf.
4. Stop or redirect a unit when scope, ownership, safety, or compatibility assumptions change. Do not silently create replacement agents.

## Integration

1. Inspect each returned diff and evidence in its Worktree. Reject unrelated edits, missing tests, stale comments, secrets, absolute local paths, or unsupported claims.
2. Integrate in the declared dependency order using a reversible Git operation appropriate to the repository. Resolve semantic conflicts in the owning unit or serially in the integration Worktree; never let two Subagents race on the conflict.
3. Run the current development-loop gate after integration: non-empty unit tests plus change-related format, lint, static, integration, contract, or minimal read-only smoke checks selected by risk.
4. Run release-level build, final-artifact smoke, Computer Use E2E, cross-platform candidates, archives, and human final review only when the user initiates a final-artifact build or release preparation. Evidence-only delivery review and release-path maintenance use relevant static, unit, and isolated contract checks without starting those real release actions. Heavy or interactive acceptance additionally requires the current task's explicit `enabled` or product/channel `required` selection.
5. Report integrated units, checks, skipped release gates, residual branches/Worktrees, unverified scope, and remaining risk.

## Conservative Retirement

Inspect before cleanup:

```text
python3 .agents/skills/run-parallel-worktrees/scripts/parallel_worktrees.py inspect --project-root <absolute-project-root>
```

Remove only an exact workflow-owned Worktree whose files are clean and whose branch is already an ancestor of the explicitly named integration ref:

```text
python3 .agents/skills/run-parallel-worktrees/scripts/parallel_worktrees.py remove --project-root <absolute-project-root> --task <task> --unit <unit> --integrated-into <ref>
```

The helper removes the Worktree registration and directory but deliberately retains the branch. Branch deletion is a separate user-authorized Git action. Never use force removal for a dirty, missing, mismatched, or unintegrated unit.

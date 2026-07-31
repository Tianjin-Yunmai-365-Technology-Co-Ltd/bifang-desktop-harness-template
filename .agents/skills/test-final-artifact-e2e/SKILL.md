---
name: test-final-artifact-e2e
description: Execute milestone-stage end-to-end acceptance against a complete real CLI, TUI, MCP host, or GUI artifact through Computer Use. Use only from $verify-delivery after every Todo is done and persistent project policy enables E2E or an approved product/channel rule requires it; never use during planning, coding, ordinary builds, collection, or release metadata work.
---

# Test Final Artifact E2E

Verify an accepted-scope scenario through the same visible interaction path a real user or host uses.

## Workflow

1. Read the approved success criteria, active Todo/milestone Work Plan, `docs/AGENT_POLICY.md`, `docs/VERIFICATION.md` and applicable interface Skill.
2. Require every Todo in the milestone batch to be `done` and `$verify-delivery` to have entered milestone acceptance. If not, stop and report `Not run`.
3. Require `milestone_e2e: enabled` or an approved product/channel `required` rule. `disabled` records `Not run` unless overridden by a hard requirement; missing/invalid/`pending` policy requires user resolution.
4. Require a complete real artifact located from build metadata. Reject a dev preview, source invocation, Mock backend, scaffold, placeholder or assumed path.
5. Define bounded scenarios from approved criteria: at least the core success path and highest-risk failure path. State prerequisites, isolated reversible data, expected observations, cleanup and timeout.
6. Start the real artifact and use the installed `computer-use` Skill for GUI, browser, terminal or host UI interaction. Inspect fresh state before and after every action; prefer accessibility-tree actions and use coordinates only from the latest screenshot.
7. Verify resulting state, output, persisted data or error presentation; a click or keystroke is not evidence by itself.
8. Capture artifact/version, source commit, platform, steps, expected/observed results, screenshots when useful, shutdown, cleanup and pass/fail. Redact secrets and unnecessary personal paths.
9. Stop before credentials, payment, production, publication or irreversible actions unless separately authorized.
10. On any failure, timeout, cancellation or selected-but-unrun scenario, record evidence, reject the milestone, reopen/add a repair Todo and return to `$implement-change`. After repair, rerun the complete milestone scenario set.
11. Mark unexercised operating systems, displays, browsers, terminals, MCP hosts and package formats `Unverified`. Human final review remains separate.

## Interface Coverage

- CLI: real binary invocation, output streams, exit status, cancellation and shutdown.
- TUI: keyboard navigation, focus, resize, error recovery and terminal restoration.
- MCP: approved real host discovery, invocation, errors, cancellation and clean disconnect.
- GUI: launch, complete user loop, accessibility state, errors, persistence and clean quit.

## Completion

Report the exact artifact, policy/hard-requirement source, scenarios, observable evidence, cleanup, passes, failures, reopened Todo and unverified scope. Never sign the human-review field.

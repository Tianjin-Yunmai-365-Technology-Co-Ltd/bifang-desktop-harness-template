---
name: test-final-artifact-e2e
description: Execute explicitly selected release-stage end-to-end acceptance against a real final CLI, TUI, MCP host, GUI, or WEB artifact by using Computer Use for observable user interaction. Use only when the current final-artifact build or release task records this check as enabled or required and a final artifact exists; do not use for ordinary development, evidence-only review, source previews, or simulated completion claims.
---

# Test Final Artifact E2E

Verify the packaged or release-mode artifact through the same visible interaction path a real user or host will use.

## Workflow

1. Read `AGENTS.md`, the approved product success criteria, project status, active plan, `docs/VERIFICATION.md`, release record, and the applicable interface Skill.
2. Require the current final-artifact build or release task to record this exact check as `enabled` by the user or `required` by an approved product/channel rule before launching any scenario. Do not inherit that state from `$verify-delivery`, `$prepare-release`, a prior release attempt, or workflow defaults. If neither state exists, stop and report the check as `Not run`.
3. Require a real final artifact and record how it was located from the build or package metadata. Do not substitute a dev preview, source invocation, mocked backend, or assumed path.
4. Define a bounded scenario set from approved acceptance criteria: at least the core success path and highest-risk failure path. State prerequisites, reversible test data, expected observations, cleanup, and timeout before launching.
5. Start the artifact using its real launcher. Use the installed `computer-use` Skill for GUI, browser, terminal, or host UI interaction; inspect fresh app state before every action and re-inspect after each action before choosing coordinates or elements.
6. Prefer accessibility-tree element actions. Use coordinates only when necessary and only from the latest screenshot. Never treat a click or keystroke as proof; verify the resulting state, output, persisted data, or error presentation.
7. Capture concise evidence for each scenario: artifact identity/version, platform, steps, expected result, observed result, screenshots where useful, exit or shutdown behavior, and pass/fail. Redact secrets and unnecessary personal paths.
8. Stop on destructive, production, credential, payment, publication, or irreversible actions unless separately approved. Use isolated data and clean up only test-owned state.
9. Record failures truthfully in `docs/VERIFICATION.md`; do not repair product code inside this Skill. Route defects to `$plan-change` and `$implement-change`, then rerun affected scenarios and the complete final set.
10. Mark every operating system, display configuration, browser, terminal, MCP host, or packaging format not actually exercised as `Unverified`. Human final review remains separate.

## Interface Coverage

- CLI: use real terminal invocation, validate prompts only when interaction is approved, output streams, exit status, cancellation, and shutdown.
- TUI: validate keyboard navigation, focus, resize, error recovery, and terminal restoration.
- MCP: interact through the approved real host UI and verify discovery, invocation, errors, cancellation, and clean disconnect.
- GUI: validate launch, complete user loop, accessibility state, errors, persistence, and clean quit.
- WEB: launch the production server/artifact, use a real supported browser, validate binding, navigation, accessibility, errors, and shutdown.

## Completion

Report the exact artifact tested, environment, explicit opt-in source for this run, scenarios, observable evidence, passes, failures, skipped cases, cleanup, unverified scope, and verification handoff. If the check was not opted in, report `Not run` rather than implying a pass. Never sign the human-review field.

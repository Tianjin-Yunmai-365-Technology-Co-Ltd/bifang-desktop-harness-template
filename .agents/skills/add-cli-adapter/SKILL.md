---
name: add-cli-adapter
description: Add an optional non-interactive CLI adapter to an initialized downstream project. Use when CLI is selected during initialization or explicitly approved later; do not require CLI when another interface was selected.
---

# Add CLI Adapter

Add the smallest Agent-ready command interface over the shared core. CLI is the default only when initialization receives no interface selection; it is never silently added beside an explicit TUI, MCP, GUI, or WEB selection.

## Workflow

1. Read `AGENTS.md`, `docs/product_spec/README.md` and the latest dated Product Spec, `docs/ENGINEERING_RULES.md`, `docs/project_status/README.md` and the latest dated Product Status, `docs/CLI_CONTRACT.md`, `docs/RUST_CLI_TEMPLATE.md`, `docs/work_plan/README.md` and the latest dated Work Plan, and relevant ADRs.
2. Confirm CLI is in the recorded interface selection. Work only in the current project root and derive `<project-id>_cli`; never ask for another directory or binary name.
3. Require an initialized shared core. A `Draft` product may receive only the neutral `scaffold status` adapter with `productDefinitionRequired=true`; an approved product receives only its planned commands.
4. Use a Tokio current-thread async entry with only the minimum required features. Keep the command-to-core path async by default for I/O, waiting, timers, processes and other latency-bound work; do not enable `rt-multi-thread` merely because Tokio is present. Consider `spawn_blocking`, dedicated threads or a multi-thread runtime only for measured CPU-intensive work, and record ownership, cancellation, concurrency limits, resource budget and tests. Replace blocking-only dependencies with async capabilities or stop for a scope/hard-rule exception; do not silently wrap them in threads.
5. Implement complete non-interactive and `--json` behavior from `docs/CLI_CONTRACT.md`. Do not make a TUI code path the only way to invoke core operations.
6. Test the real binary: success, highest-risk failure, JSON parsing, stdout/stderr separation, exit codes, `--help`/`--version`, and refusal to wait for input. During `Draft`, also reject unapproved business commands.
7. During ordinary implementation, run discovered format, lint, non-empty tests, locked check/build checks needed by the change, and targeted real-binary black-box tests. Do not claim release readiness from development evidence.
8. When the user initiates a final-artifact build or prepares a release, first capture this run's release-stage selection before the production build starts. Always run the locked production build, artifact existence, and read-only binary smoke. Run `$test-final-artifact-e2e` only when the user explicitly selected it for this run or an approved product/channel rule makes it mandatory; never assume prior approval. If a selected E2E check fails, times out, is cancelled, or is not executed after selection, block packaging and hand the failed evidence to `$verify-delivery`. If it was not selected and is not mandatory, record `Not run` plus residual risk. A delivery-status review only inspects existing evidence and does not start these actions. Record current-platform evidence and mark other platforms `Unverified`.

## Boundaries

- CLI depends on core; core never depends on CLI, clap, terminal I/O, or process exit state.
- CLI is optional after an explicit interface selection and must not be added merely to satisfy an old Harness rule.
- Do not parse another adapter's output or duplicate business rules.
- Do not block the async runtime with synchronous I/O, sleeps, process waits or CPU-heavy loops. A thread-based boundary requires measured CPU-intensive work; a blocking-only dependency must be replaced or approved as an exception.
- The bundled `rust-lib-cli` asset is a neutral CLI validation asset, not a requirement for projects that select other interfaces.

## Completion

Report commands, core mappings, output contract, tests, artifact path, verified platform, unverified platforms, and remaining risks.

---
name: add-tui-adapter
description: Add an optional Ratatui terminal adapter with tui-realm and its mature standard component library to an initialized downstream project. Use when TUI is selected during initialization or approved later.
---

# Add TUI Adapter

Add a focused Ratatui terminal interface over the shared core without requiring or automating a CLI adapter.

## Workflow

1. Read `AGENTS.md`, `README.md`, `docs/product_spec/README.md` and the latest dated Product Spec, `docs/ENGINEERING_RULES.md` (engineering rules), `docs/project_status/README.md` and the latest dated Product Status, `docs/work_plan/README.md` and the latest dated Work Plan, `docs/RUST_CLI_TEMPLATE.md`, and relevant ADRs and verification records.
2. Confirm TUI is recorded in scope and identify the minimum interactive loop, target terminals, keyboard behavior, resize behavior, accessibility expectations, and safe quit/recovery behavior.
3. Work in `<project-id>_tui` inside the current root. Require shared core, but do not require CLI, MCP, GUI, or WEB.
4. Read [references/tui-baseline.md](references/tui-baseline.md) completely. Use Ratatui for rendering, tui-realm for the component/event architecture, and tui-realm-stdlib as the mature standard component library. This stack is a hard rule for Draft and Approved projects.
5. At execution time resolve the latest compatible stable Ratatui, tui-realm and tui-realm-stdlib combination that satisfies the declared MSRV, target terminals/platforms, minimum features and full verification gates. Record evaluated versions and lock the result. If no compatible combination exists, stop and use the hard-rule exception process; do not silently choose another TUI stack.
6. Run the TUI event loop from a Tokio current-thread async entry. Prefer async event polling, channels, timers, process/file/network calls and core operations; never perform synchronous waiting on the render/event thread. Consider `spawn_blocking`, dedicated threads or a multi-thread runtime only for measured CPU-intensive work, with explicit ownership, cancellation, backpressure, concurrency limits, resource budget and tests. Replace blocking-only dependencies with async capabilities or stop for a scope/hard-rule exception.
7. For a `Draft` project expose only neutral scaffold status and navigation; do not invent business screens or side effects. For an approved product, implement only planned views and actions. Keep terminal events, rendering state, component messages and key bindings outside core.
8. Prefer tui-realm-stdlib components for ordinary input, selection, tables, lists, labels, paragraphs, tabs, gauges and charts. Create a project component only when the standard library cannot express an approved behavior; record why composition or styling was insufficient.
9. Test component messages and state transitions, async event/task cancellation, keyboard navigation, resize and small-terminal behavior, error/empty/loading states, highest-risk action confirmation, restoration of terminal state after normal exit and failure, and core mappings.
10. Run format, lint, non-empty tests, locked build, artifact existence, and bounded startup/exit smoke checks. Use `$test-final-artifact-e2e` with Computer Use when final terminal interaction must be observed in the real packaged artifact.
11. Update project memory and hand the result to `$verify-delivery`.

## Hard Boundaries

- TUI depends on core; core does not depend on Ratatui, tui-realm, terminal backends, component messages or presentation state.
- Do not spawn or scrape CLI output to implement TUI behavior.
- Do not replace the fixed TUI stack because the interface is small or another library is familiar. A deviation requires an ADR hard-rule exception with risks, alternative evidence and recovery criteria.
- Do not add mouse support, themes, dashboards, background services, terminal-specific shortcuts or third-party component extensions without an approved need.
- Do not copy standard components into project code merely to restyle them; prefer supported composition and properties.
- Do not block the Tokio runtime or terminal event loop with synchronous I/O, sleeps, process waits or CPU-heavy rendering/data work.
- Untested terminals and operating systems remain `Unverified`.

## Completion

Report resolved Ratatui/tui-realm/tui-realm-stdlib versions and features, reused and custom components, views, key flows, core mappings, terminal restoration evidence, tests, artifact, verified environments, unverified areas, and remaining risks.

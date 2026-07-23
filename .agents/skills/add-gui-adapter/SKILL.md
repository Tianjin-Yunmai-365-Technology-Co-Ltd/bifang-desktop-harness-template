---
name: add-gui-adapter
description: Add an optional Tauri 2 GUI with the fixed React, TypeScript, Mantine UI, TanStack Router/Query, and Jotai frontend stack to an initialized shared core.
---

# Add GUI Adapter

Add the smallest approved Tauri 2 desktop interface directly over the shared core. GUI is independent of CLI, TUI, MCP, and WEB.

## Workflow

1. Read `AGENTS.md`, `README.md`, `docs/product_spec/README.md` and the latest dated Product Spec, `docs/ENGINEERING_RULES.md`, `docs/project_status/README.md` and the latest dated Product Status, `docs/work_plan/README.md` and the latest dated Work Plan, `docs/RUST_CLI_TEMPLATE.md`, and relevant decisions, verification, and release records.
2. Confirm that the current working directory is a real downstream Rust workspace with a shared core and that GUI is recorded in the initialization selection or approved product scope. A `Draft` project may receive only a neutral scaffold-status GUI without business actions. If it is the documentation-only Harness or core is absent, stop. Do not ask for another target directory and do not require CLI.
3. Read [references/gui-baseline.md](references/gui-baseline.md) and the shared [React frontend baseline](../add-web-adapter/references/react-frontend-baseline.md) completely before selecting dependencies or designing screens.
4. Before the first product GUI development task, require an approved `docs/GUI_APP_PROFILE.md` produced by `$prepare-gui-app-identity`. It must cover the application display name, primary window title, description, application identifier, and the user-selected icon path. A temporary neutral scaffold icon may unblock non-packaging development only when packaging/release remains explicitly blocked.
5. Identify the approved human scenario, minimum screens and actions, state and error presentation, keyboard and accessibility requirements, refresh/concurrency semantics, platform integration, privacy boundary, and intended distribution format. Ask only about missing choices that materially change scope.
6. Use `$plan-change` before editing. Keep the GUI adapter independent from CLI parsing and MCP protocol code.
7. Inspect official registries and documentation at execution time. Use the latest compatible stable Tauri 2 plus React, TypeScript, Mantine UI, TanStack Router, TanStack Query and Jotai versions that satisfy the Rust MSRV, Node and pnpm policy, target WebViews/platforms, security and locked verification gates. These are hard rules for Draft and Approved GUI projects; an incompatible stack blocks implementation until a hard-rule exception is recorded.
8. Add the desktop app boundary in `<project-id>_gui`, using that identifier for its Cargo package, Rust crate and real application binary. Do not ask for independent binary names; human-facing names come from the approved GUI profile. Reuse Tauri's Tokio-backed singleton async runtime; do not create a nested Tokio runtime. The Tauri Rust adapter may depend on core; core must not depend on Tauri, WebView, React, route, query, command, window or frontend-state types. Apply the engineering rules to maintained Rust/frontend code and tests.
9. Expose narrow typed plain `async fn` Tauri commands that validate input, call async core APIs and map results. Keep I/O, waiting, timers and process calls async. Consider Tauri's async runtime `spawn_blocking` or a separately approved thread boundary only for measured CPU-intensive work, with ownership, cancellation, concurrency limits, resource budget and tests. Replace blocking-only dependencies with async capabilities or stop for a scope/hard-rule exception. Use an explicit CSP plus the minimum capability, permission and scope set for named windows/webviews. Load only packaged local content by default.
10. Implement only the approved management loop. Use Mantine UI for components/layout, TanStack Router for navigation, TanStack Query for command-backed asynchronous state and Jotai only for cross-component client interaction state. Do not mirror Query/core/durable data into atoms.
11. Keep stable resource IDs distinct from view positions, make selection and batch scope explicit, show truthful empty/loading/error states, and obtain all durable state from the shared core/store.
12. Test Rust async command mappings, task cancellation, the core success path, highest-risk failure, routes, query lifecycle, Jotai transitions, frontend interaction, keyboard navigation, accessibility semantics, capability denials, concurrent refresh/write behavior and version/about information. Use visual QA when layout is part of acceptance.
13. Run discovered Rust and frontend formatting, typecheck, lint, non-empty tests, locked desktop production build, final-artifact existence, real application startup smoke and approved UI acceptance. Missing signing identity, certificate, notarization credentials or updater key must not block build or local verification; record the artifact as unsigned. Verify only the current native platform unless native evidence exists for others; mark untested platforms `Unverified`.
14. If the approved distribution target requires signing, notarization, Store submission or signed updater artifacts, keep release readiness blocked until that separate channel gate passes. Do not convert an unsigned build success into distribution readiness.
15. Update product, status, plan, decisions, verification, release notes and Changelog where affected. Add packaging or release automation only through separately authorized release work. Use `$verify-delivery` for the completion verdict; do not claim human approval.

## Hard Boundaries

- Keep GUI independent and behaviorally consistent with every selected adapter through the same core and error model.
- Never automate the CLI or parse CLI output from the GUI.
- Never place business rules, durable state, migrations or platform-independent validation in React components, routes, queries, atoms or event handlers.
- Do not create a second store or frontend-owned copy of authoritative data.
- Do not replace any fixed React frontend library because the GUI is small or another stack is familiar. Deviations require a hard-rule exception ADR.
- Do not enable remote URLs, broad Tauri permissions, plugins, sidecars, tray, autostart, updater or platform integrations without an approved need.
- Do not add another router, server-state cache, general-purpose global store or optional frontend package without a real project requirement.
- Do not block Tauri's Tokio runtime with synchronous I/O, sleeps, process waits or CPU-heavy commands, and do not create a nested runtime.
- Do not require signing material merely to compile, test, package for local verification or smoke-test a GUI artifact. Distribution-channel signing requirements remain separate release gates.
- Do not bundle GUI starter assets in this Skill; derive screens from the real downstream product contract when invoked.

## Completion Output

Report resolved Tauri/frontend versions, screens and commands, Mantine components, Router/Query/Jotai ownership, core mappings, capability/CSP boundary, interaction/accessibility checks, commands run, verified platforms, unverified areas and remaining risks.

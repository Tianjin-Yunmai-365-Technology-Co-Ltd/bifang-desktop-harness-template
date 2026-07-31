# Tauri desktop GUI baseline

Read this reference only after an explicit downstream request has passed the GUI scope gate. Also read the GUI-owned [React frontend baseline](react-frontend-baseline.md).

## Fixed defaults

- Use Tauri 2 with the existing Rust shared core and Tokio adapter standard.
- Reuse Tauri's Tokio-backed singleton async runtime and implement custom commands as plain `async fn`; do not create a nested Tokio runtime.
- Package a local React + TypeScript frontend using Mantine UI, TanStack Router, TanStack Query and Jotai.
- Do not load remote content.
- Keep the Tauri Rust boundary thin: validate input, call core and map typed results.
- Resolve and lock the latest mutually compatible stable Tauri/frontend versions when invoked; validate the Rust MSRV, Node/pnpm policy and target platform WebViews.
- Use pnpm as the frontend package manager and require current-host Node.js plus pnpm evidence from `$check-development-environment`.
- The fixed frontend applies to a neutral Draft scaffold and an approved product. Do not replace it with plain HTML/ES modules or another framework based on screen count.

## Required design inputs

Record:

- the approved application display name, primary window title, short description, application identifier and user-selected icon source from `docs/GUI_APP_PROFILE.md`;
- the approved human scenario and why a desktop surface is selected;
- minimum windows, screens, routes, navigation and operations;
- empty, loading, success, validation, conflict and failure states;
- keyboard order, shortcuts, focus behavior, labels and accessibility acceptance;
- stable IDs, selection semantics, batch scope, search, sort and pagination when applicable;
- refresh, concurrent modification, cancellation and recovery behavior;
- required filesystem, process, notification, shell, tray, startup or updater access;
- current-platform packaging target and other platforms to leave `Unverified`.

## Security and architecture rules

- Define an explicit CSP for packaged content.
- Grant capabilities to named windows/webviews and include only required permissions and scopes.
- Keep remote URL access disabled.
- Do not expose generic filesystem or shell access when a narrow Rust command can perform the approved operation.
- Keep durable data, migrations, concurrency control and business validation behind the shared core/store.
- Use TanStack Query for typed asynchronous command results and invalidation; use Jotai only for client interaction shared across components. Never copy Query/core data into atoms.
- Show authoritative version, status, timestamps and errors from real application state.
- Make destructive and batch-operation scope visible before commitment.
- Keep I/O, waits, timers, processes and command-to-core calls async. Consider `tauri::async_runtime::spawn_blocking` or another approved thread boundary only for measured CPU-intensive work, with explicit ownership, cancellation, concurrency limits and resource-budget evidence. Replace blocking-only dependencies with async capabilities or stop for a scope/hard-rule exception.

## Minimum evidence

- Rust command tests cover the core success path and highest-risk failure path.
- Frontend tests cover Mantine interaction, routes, query lifecycle, Jotai transitions and truthful failure presentation.
- Keyboard-only use and applicable accessibility semantics are checked.
- Unapproved WebView calls are denied by capability/permission configuration.
- Concurrent GUI/other-adapter access observes the same data without corruption.
- A locked frontend production build and locked Tauri build both succeed.
- Missing signing identity, certificate, notarization credentials or updater key does not block a build or milestone-stage local smoke test; record the result as unsigned. A distribution channel that requires signing remains a separate release blocker.
- The real packaged or release-mode application starts and renders the critical route on the current platform.
- Each claimed installer or native platform has actual build and accepted-milestone evidence. Smoke/E2E evidence is required only when persistent policy or a hard requirement selected it; otherwise record `Not run` and risk.

## Exception and recommendation boundary

Tauri 2 and the fixed React frontend stack are hard rules. A replacement requires a recorded hard-rule exception with the failed constraint, risk, substitute evidence and recovery/migration criteria.

Plugins, sidecars, tray behavior, autostart, updater, broader platform APIs, package manager, build tool, form/icon/chart packages and test framework remain project-specific choices. Add or recommend them only for an approved need plus dependency, security, packaging and test changes.

Official runtime and signing references:

- [Tauri async runtime](https://docs.rs/tauri/latest/tauri/async_runtime/)
- [Tauri distribution and signing](https://v2.tauri.app/distribute/)
- [Windows signing behavior](https://v2.tauri.app/distribute/sign/windows/)
- [Linux signing behavior](https://v2.tauri.app/distribute/sign/linux/)

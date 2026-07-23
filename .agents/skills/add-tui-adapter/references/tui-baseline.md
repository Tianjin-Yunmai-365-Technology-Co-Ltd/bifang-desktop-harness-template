# Ratatui TUI baseline

Read this reference only after TUI is selected during initialization or approved later.

## Fixed stack

- Use Ratatui as the terminal rendering and widget foundation.
- Use tui-realm as the component, event, message and application-state framework over Ratatui.
- Use tui-realm-stdlib as the standard component library. Start with its maintained components for common controls such as inputs, text areas, checkboxes, radio/select controls, lists, tables, labels, paragraphs, tabs, gauges and charts.
- Use the terminal backend supported by the selected compatible stable stack and approved target terminals. Do not add multiple backends without a tested requirement.
- Resolve actual stable versions at execution time. The selected Ratatui, tui-realm and tui-realm-stdlib releases must be mutually compatible and satisfy the project's Rust MSRV, Windows/macOS/Linux targets and locked verification.

The fixed stack applies even to neutral Draft scaffold status. “Latest” means the latest compatible stable combination that passes all constraints; it does not mean a prerelease, an unverified Git revision, a silent MSRV increase or separate incompatible latest versions.

## Architecture rules

- Core owns domain state and errors. The TUI adapter maps core results into view models and tui-realm messages.
- tui-realm owns focus, component lifecycle, subscriptions and UI messages; do not leak these types into core.
- Ratatui widgets render presentation state. Do not make the frame, terminal backend or screen coordinates authoritative domain state.
- Reuse tui-realm-stdlib before creating project components. A custom component must correspond to an approved interaction the standard library cannot express through composition, properties or styling.
- Keep stable resource IDs separate from list/table indices and current focus.
- Bound event polling and background work, define cancellation and shutdown, and restore the terminal on normal exit, error and panic paths.
- Start the adapter through a Tokio current-thread async entry. Prefer async terminal event polling, channels, timers and boundary operations; never block the event/render loop with synchronous waits.
- Consider `spawn_blocking`, dedicated threads or a multi-thread runtime only for measured CPU-intensive work, with ownership, cancellation, backpressure, concurrency limits and resource-budget evidence. Replace blocking-only dependencies with async capabilities or stop for a scope/hard-rule exception.

## Required evidence

- Record evaluated and selected crate versions, feature sets, MSRV/platform compatibility and lockfile result.
- Unit-test messages, focus and state transitions without requiring a real terminal where practical.
- Test resize, minimum supported dimensions, Unicode width, empty/loading/error states and high-risk confirmations.
- Exercise the real release artifact in a representative terminal and verify bounded quit plus terminal restoration.
- Mark every untested terminal/backend/platform `Unverified`.

## Exception boundary

Ratatui, tui-realm and tui-realm-stdlib are hard rules. If their compatible stable releases cannot meet an approved product, accessibility, MSRV, platform or security requirement, stop and record a hard-rule exception ADR containing the failed constraint, alternatives, risks, substitute verification and recovery/migration criteria. Do not silently substitute another framework or component library.

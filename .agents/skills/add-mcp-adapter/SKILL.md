---
name: add-mcp-adapter
description: Add an optional Rust stdio MCP server adapter to an initialized downstream project with a shared core. Use when MCP is selected during initialization or explicitly approved later; do not require CLI or another interface adapter.
---

# Add MCP Adapter

Add the smallest approved stdio MCP surface directly over the shared core. MCP is independent of CLI, TUI, GUI, and WEB.

## Workflow

1. Read `AGENTS.md`, `README.md`, `docs/product_spec/README.md` and the latest dated Product Spec, `docs/ENGINEERING_RULES.md`, `docs/project_status/README.md` and the latest dated Product Status, `docs/work_plan/README.md` and the latest dated Work Plan, `docs/RUST_CLI_TEMPLATE.md`, and relevant decisions and verification records.
2. Confirm that the current working directory is a real downstream Rust workspace with a shared core and that MCP is recorded in the initialization selection or approved product scope. A `Draft` project may expose only a neutral scaffold-status tool without business actions. If it is the documentation-only Harness or core is absent, stop. Do not ask for another target directory and do not require CLI.
3. Read [references/mcp-baseline.md](references/mcp-baseline.md) completely before selecting dependencies or designing tools. Also read the MCP subsection of `docs/RUST_CLI_TEMPLATE.md` for the minimal hard rules on tool-schema/source-of-truth contract consistency and naming/description basics before implementing.
4. Identify the target MCP hosts, the minimum tool-supported user loop, each tool-to-core mapping, input/output schema, stable error mapping, side effects, permissions, risk annotations, timeout, cancellation, and shutdown behavior. Ask only about missing choices that materially change scope.
5. Use `$plan-change` before editing. Keep the MCP adapter independent from CLI parsing and GUI code.
6. Inspect the registry and official MCP Rust SDK documentation at execution time. Prefer the current compatible stable `rmcp` release with default features disabled and only the approved server, macros, and stdio transport features. Do not assume MSRV from an absent `rust-version`; prove compatibility with the project's real MSRV toolchain.
7. Add one independently testable MCP binary crate in `<project-id>_mcp`, where `<project-id>` is the approved ASCII snake_case current project identifier. Use the same `<project-id>_mcp` for its Cargo package, Rust crate, and real binary; do not ask for independent names. Start stdio serving from a Tokio current-thread async entry and keep transport, tool and core calls async by default. Do not enable `rt-multi-thread` for ordinary protocol concurrency. The adapter may depend on core; core must not depend on MCP, `rmcp`, transport types, or protocol schemas. Apply the file boundaries and meaningful Chinese business-comment requirements from `docs/ENGINEERING_RULES.md` to all maintained adapter code and tests.
8. Expose only approved core-loop tools. Validate structured inputs before invoking core, map domain errors without losing stable codes, keep protocol traffic exclusively on stdout, and send diagnostics only to stderr. Consider `spawn_blocking`, dedicated threads or a multi-thread runtime only for measured CPU-intensive work, with explicit ownership, cancellation, timeout, concurrency limits, resource budget and tests. Replace blocking-only dependencies with async capabilities or stop for a scope/hard-rule exception. Do not add HTTP, OAuth, client, sampling, prompts, resources, or background services without separate approved requirements.
9. Test tool discovery, the core success path, the highest-risk failure path, invalid schema input, stable errors, stdout/stderr separation, clean EOF shutdown, cancellation or timeout where applicable, and any approval/risk behavior the target hosts actually support.
10. Run the repository's discovered formatting, lint, test, locked release build, final-artifact existence, and real binary smoke checks. Add an MCP inspector or target-host acceptance only when its real command and environment are available. Mark untested hosts and platforms `Unverified`.
11. Update product, status, plan, decisions, verification, release notes, and CHANGELOG where affected. Use `$verify-delivery` for the completion verdict; do not claim human approval.

## Hard Boundaries

- Keep MCP independent and behaviorally consistent with every selected adapter through the same core and error model.
- Never implement MCP by spawning the CLI and parsing its output.
- Never mirror every core function automatically; one tool must represent one clear approved action.
- Treat MCP annotations as descriptive hints, not authorization enforcement.
- Do not create a second store, configuration source, permission model, or business layer.
- Do not broaden filesystem, process, network, or destructive permissions beyond the approved tool operation.
- Do not block the Tokio stdio runtime with synchronous I/O, sleeps, process waits or CPU-heavy tool work.
- Do not bundle generic MCP boilerplate assets in this Skill; derive the adapter from the real downstream contract when invoked.

## Completion Output

Report the tools added, core mappings, dependency/features selected, protocol and security checks, commands actually run, verified hosts/platforms, unverified areas, and remaining risks.

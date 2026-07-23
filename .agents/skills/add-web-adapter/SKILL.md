---
name: add-web-adapter
description: Add an optional local-first WEB adapter with the fixed React, TypeScript, Mantine UI, TanStack Router/Query, and Jotai frontend stack to a shared core.
---

# Add WEB Adapter

Add the smallest browser-accessible interface over the shared core. WEB is independent of CLI, TUI, MCP, and desktop GUI.

## Workflow

1. Read `AGENTS.md`, `README.md`, `docs/product_spec/README.md` and the latest dated Product Spec, `docs/ENGINEERING_RULES.md` (engineering rules), `docs/project_status/README.md` and the latest dated Product Status, `docs/work_plan/README.md` and the latest dated Work Plan, `docs/RUST_CLI_TEMPLATE.md`, [references/react-frontend-baseline.md](references/react-frontend-baseline.md), and relevant ADRs, verification, and release records.
2. Confirm WEB is recorded in scope. Resolve whether the approved target is local-only or remotely served, plus authentication, network binding, persistence, browser support, and deployment boundaries. Remote exposure or hosting requires explicit approval.
3. Work in `<project-id>_web` inside the current project root and depend directly on shared core. Do not require or invoke another adapter.
4. Read [references/react-frontend-baseline.md](references/react-frontend-baseline.md) completely. Use the latest compatible stable React + TypeScript, Mantine UI, TanStack Router, TanStack Query and Jotai stack for Draft and Approved projects.
5. Require current-host Node.js and pnpm evidence from `$check-development-environment`. At execution time verify official releases, Node policy, browser targets, package compatibility, security advisories and production-build support. Save compatible ranges in the package manifest and commit `pnpm-lock.yaml`. If the fixed stack cannot pass approved constraints, stop for a hard-rule exception; do not silently swap libraries.
6. For a `Draft` project expose only a neutral local scaffold-status route. For an approved product implement only its planned browser loop. The fixed stack still applies; do not replace it with ad hoc HTML because the surface is small.
7. Bind to loopback by default, use ephemeral or explicit ports, deny broad cross-origin access, serve local assets, validate all inputs, and keep secrets out of frontend state and URLs.
8. Use TanStack Router as the only application router, TanStack Query for server/async state and cache, and Jotai only for cross-component client/interaction state. Do not copy Query data, core state or durable records into atoms.
9. Test core mappings, routes/API schemas, query loading/error/refetch behavior, client-state transitions, highest-risk failure, authorization boundary, input validation, browser keyboard/accessibility behavior, and shutdown. Run a real browser acceptance flow when available.
10. Run format, typecheck, lint, non-empty tests, locked production build, artifact existence, and bounded server startup/shutdown smoke. Use `$test-final-artifact-e2e` with Computer Use for final browser flows, then hand delivery judgment to `$verify-delivery`.

## Hard Boundaries

- WEB depends on core; core never depends on HTTP, React, browser, framework, route, query or frontend-state types.
- Local WEB is not authorization for LAN/public binding, cloud hosting, telemetry, cookies, accounts or remote content.
- Do not proxy to CLI/MCP or duplicate domain state in the frontend.
- Do not replace React, TypeScript, Mantine UI, TanStack Router, TanStack Query or Jotai based on project size or preference; deviations require a hard-rule exception ADR.
- Do not add another router, server-state cache or general-purpose global state library.
- Fixed-stack packages do not authorize optional Mantine packages, Router/Query plugins, Jotai extensions, build tools or test frameworks; recommend those only for a real project need.
- Record tested browsers and platforms; all others remain `Unverified`.

## Completion

Report resolved frontend versions, routes/screens, Mantine components, Router/Query/Jotai ownership, binding and security boundary, core mappings, tests, production artifact, browser evidence, unverified environments, and remaining risks.

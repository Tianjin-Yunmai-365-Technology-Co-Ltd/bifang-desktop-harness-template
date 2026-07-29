---
name: initialize-rust-project
description: Initialize one neutral downstream Rust project, select interfaces, then permanently remove initialization-only capabilities while retaining development Skills and constraint maps.
---

# Initialize Rust Project

Create a reusable shared core and only the interfaces the user selects. CLI is optional, but it is the deterministic default when no interface is selected.

## Workflow

1. Read `docs/project_status/README.md` and the latest dated Product Status when present, plus `docs/AGENT_POLICY.md`, `docs/ENGINEERING_RULES.md`, and `docs/RUST_CLI_TEMPLATE.md`. A newly instantiated downstream intentionally has no `docs/product_spec/`, `docs/work_plan/`, `docs/adr/`, or `docs/changelog/`; do not create them during neutral initialization. Require only current project identity and ASCII `snake_case` identifier; product facts remain undefined until `$define-product`.
2. Resolve the current directory as the sole downstream root. Stop in the documentation-only Harness source, preserve files, and never create an alternate project directory.
3. Require Git before scaffold writes. Run `git --version`, then determine whether the canonical `git rev-parse --show-toplevel` equals the current project root. If it does not, run `git init --initial-branch=main .` in the current root even when a parent repository exists. Verify inside-work-tree is `true`, top-level equals the current root, the initial branch is `main`, and `git remote` is empty. Do not create a pre-scaffold commit, tag, remote, push, hosted repository, signature, or global Git configuration. An existing correct independent repository is left unchanged until final clean-state verification.
4. Ask which initialization interfaces are required from exactly `CLI`, `TUI`, `MCP`, `GUI`, and `WEB`; accept any combination. If the user makes no selection, record `CLI`. Do not silently add CLI beside an explicit selection.
5. When invoked directly, ask whether to disable superpowers and record `superpowers: disabled` or `superpowers: enabled` in `docs/AGENT_POLICY.md`; an absent answer keeps `enabled`. When `$instantiate-project` has already recorded the user's answer in the same workflow, confirm and reuse that value instead of asking twice. Confirm `AGENTS.md` enforces it during later development.
6. Invoke `$check-development-environment` with the recorded interface selection before writing scaffold files. Rust is always required; Windows retains its Rust MSVC prerequisite. Only a selection containing `GUI` or `WEB` adds blocking Node.js and pnpm gates. Record the current-host evidence and stop on a blocked required tool.
7. Create the root Cargo workspace and `<project-id>_core` from the neutral asset without business assumptions. Keep core runtime-neutral and free of interface, process, terminal, protocol, browser, or desktop types. Root `[workspace.dependencies]` remains the only dependency source and member manifests use `workspace = true`. Create or update the project-root `.gitignore` so it contains the root-anchored `/release/` entry exactly once; do not ignore release-like directories outside the root.
8. Dispatch each recorded interface to its own Skill: `$add-cli-adapter`, `$add-tui-adapter`, `$add-mcp-adapter`, `$add-gui-adapter`, or `$add-web-adapter`. Each selected Skill owns its adapter directory and tests. TUI uses the fixed Ratatui + tui-realm + tui-realm-stdlib stack; WEB and GUI frontend use the fixed React + TypeScript + Mantine UI + TanStack Router + TanStack Query + Jotai stack. The bundled `rust-lib-cli` asset supplies the neutral core and optional CLI implementation; do not copy its CLI member when CLI is not selected.
9. While Product Spec is absent or `Draft`, every selected interface may expose only neutral scaffold status with `productDefinitionRequired=true` or an interface-equivalent visible status. Do not invent business commands, tools, screens, routes, data, or side effects. After product approval, `$plan-change` and `$implement-change` replace neutral surfaces.
10. Generate `Cargo.lock` through Cargo. Run format, lint, non-empty tests, locked build, and real artifact smoke checks for every created member. Tests must cover core neutral status and each selected adapter's observable status plus rejection of unapproved business behavior.
11. Update the retained Product Status, selected interfaces, policy, verification and technical debt with actual results. Do not create Product Spec, Work Plan, ADR, or Changelog content for neutral initialization. Record the pre-finalization Git top-level, branch and status plus untested systems. If GUI is selected, record that `$prepare-gui-app-identity` is mandatory before the first product GUI development task.
12. Finalize the downstream repository only after all scaffold checks finish:
    - remove `.agents/skills/instantiate-project/` completely and remove `.agents/skills/initialize-rust-project/` completely;
    - remove template-only `scripts/validate_harness.py`, `docs/HARNESS_ENGINEERING.md`, initialization walkthroughs, initialization gate descriptions, Harness identity/history, and any route that could instantiate or initialize another project;
    - retain `$rename-project-identity`, `$check-development-environment`, `$prepare-gui-app-identity`, `$run-parallel-worktrees`, product-development, adapter, verification and release Skills that remain applicable;
    - retain both inherited proprietary commercial license files `LICENSE.zh-CN.md` and `LICENSE.en.md` with the target project name established by `$rename-project-identity`; fail finalization if either file is missing, contains the old Harness identity, is otherwise altered after the approved rename, or is scheduled for deletion;
    - rewrite `AGENTS.md` for the generated project while preserving nonempty `## Skills 地图` and `## 约束地图` sections. The Skills map must list every retained project Skill and first-development trigger, including the per-task approval gate for `$run-parallel-worktrees`. The constraint map must link every retained hard-rule source and explicitly prohibit downstream derivation;
    - search the downstream root and fail finalization if an active reference to `$instantiate-project`, `$initialize-rust-project`, their directories, or initialization-only gates remains outside historical evidence.
13. After pruning, when this run follows `$instantiate-project`, confirm `docs/adr/`, `docs/changelog/`, `docs/product_spec/`, and `docs/work_plan/` remain absent. On a directly initialized pre-existing downstream, preserve any project-owned memory already present and never delete it to satisfy this check. Stage the complete initialized downstream tree and create exactly one local baseline commit with message `chore: initialize project`, using the user's existing Git identity. If author identity is unavailable, stop and request it; do not fabricate an identity or change global Git configuration.
14. Verify the completed repository from the canonical project root: inside-work-tree is `true`; top-level equals the project root; branch is `main`; `HEAD` resolves to the baseline commit; `git remote` is empty; and `git status --porcelain=v1 --untracked-files=all` returns no output. Any failure blocks completion.
15. Route next to `$define-product`. The generated downstream project is a terminal project root, not another Harness; never claim product delivery from the scaffold.

## Architecture Invariants

- The current project root is both the sole downstream root and its independent Git top-level; a parent repository never substitutes for it.
- Root `Cargo.toml` manages shared core and exactly the selected adapter members.
- Deterministic directories are `<project-id>_core`, `_cli`, `_tui`, `_mcp`, `_gui`, and `_web`.
- Every adapter depends directly on core and never parses, spawns, embeds, or requires another adapter.
- CLI, TUI and MCP adapters use Tokio current-thread async entries by default; GUI reuses Tauri's Tokio-backed async runtime. All Rust adapter work prefers async I/O and waiting. Only measured CPU-intensive work may enter a bounded thread-based boundary; blocking-only dependencies must be replaced or approved through the scope/hard-rule exception process. Core remains runtime-neutral unless an approved domain need says otherwise.
- Selected TUI/WEB/GUI adapters apply their fixed technology stacks even in Draft; a replacement requires a recorded hard-rule exception.
- CLI obeys `docs/CLI_CONTRACT.md` only when CLI is selected.
- `docs/AGENT_POLICY.md` is persistent project policy, not transient chat context.
- Product Spec, Work Plan, ADR, and Changelog are downstream development memory, not initialization payload.
- A finalized downstream project cannot instantiate or initialize another project from itself.
- A finalized downstream project preserves both inherited proprietary commercial license files and remains subject to their terminal-downstream restriction.
- `AGENTS.md` always retains nonempty Skills and constraint maps; pruning may remove map entries but never either map.
- Initialization completes only with one real local baseline commit and an empty porcelain status in the independent repository.
- The project-root `.gitignore` contains `/release/`, and release collection owns that ignored directory.

## Completion

Report Git version/top-level/branch/baseline commit, empty remote set, exact clean-worktree command and result, development-environment gate results and installations, selected interfaces and default use, superpowers policy, created members, tests/build/smoke evidence, excluded memory streams, removed initialization-only paths, retained Skills/constraint maps, unverified platforms, and `productDefinitionRequired=true`.

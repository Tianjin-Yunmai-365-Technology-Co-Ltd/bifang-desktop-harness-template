---
name: check-development-environment
description: Check and install the downstream development toolchain on first development, with Rust always required and Node.js plus pnpm required for GUI.
---

# Check Development Environment

Establish the development toolchain without depending on initialization Skills that are removed from a generated downstream project.

## Workflow

1. Read `AGENTS.md`, `docs/project_status/README.md` and the latest dated Product Status, `docs/AGENT_POLICY.md`, `docs/RUST_CLI_TEMPLATE.md`, the selected-interface record, and the latest relevant entry in `docs/VERIFICATION.md`.
2. Run before the first code-changing development task. Run again when the selected interfaces, MSRV, frontend toolchain policy, host system, or recorded environment evidence changes. Do not rerun merely because a new chat starts when current-host evidence still matches.
3. Read [references/development-environment-gates.md](references/development-environment-gates.md). On macOS/Linux run `scripts/development-environment-gates.sh --install-missing --interfaces <comma-separated-selection>`; on Windows run `scripts/development-environment-gates.ps1 -Interfaces <selection>`.
4. Rust is always blocking. On Windows the MSVC C++ workload required by the Rust target is also blocking. Missing prerequisites are installed from the verified official sources encoded by the gate and then reprobed; an existing incompatible toolchain is never silently replaced.
5. Node.js and pnpm are blocking only when the recorded interface selection contains `GUI`. For projects without GUI, report both as `not-required` and do not probe, install, upgrade, or add them.
6. Record the host, selected-interface fingerprint, observed versions, installation changes, final status, and any unverified platforms in `docs/VERIFICATION.md`. Do not record unnecessary home-directory paths or secrets.
7. Stop the development task when a required gate is blocked. A successful gate authorizes development but is not build, test, artifact, acceptance, or human-review evidence.

## Persistence Invariants

- This Skill and its scripts are retained after downstream initialization.
- `AGENTS.md` must route the first applicable development task here even after `$instantiate-project` and `$initialize-rust-project` have been removed.
- The environment result is tied to the current host and selected-interface fingerprint; it must not be inferred for Windows, macOS, or Linux hosts that were not checked.

## Completion

Report the selected interfaces, required and not-required tools, observed versions, automatic installations, blocking failures, current-host evidence location, and unverified platforms.

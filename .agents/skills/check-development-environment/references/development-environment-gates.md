# Development environment gates

Use this reference before the first code-changing task in a generated downstream project. It is independent of initialization and remains after initialization-only Skills and documents are removed.

## Executable entrypoints

- macOS/Linux: `scripts/development-environment-gates.sh --install-missing --interfaces <comma-separated-selection>`.
- Windows PowerShell 5.1 or newer: `scripts/development-environment-gates.ps1 -Interfaces <selection>`.
- Use `--check-only` or `-CheckOnly` only for a read-only audit. Exit code `20` means at least one required tool is missing.
- Parse stable `gate.<environment>.<field>=<value>` lines. Rust is always required. Windows also requires MSVC Build Tools. Node.js and pnpm are required only when the selection contains `GUI` or `WEB`; otherwise both must be `not-required`.

## Probe matrix

| Environment | Applies when | Probe | Missing behavior |
|---|---|---|---|
| Rust | Always | `rustup --version`, `rustc --version`, `cargo --version`, `rustc -vV` | Install stable Rust from the verified official rustup artifact, then repeat all probes. |
| MSVC Build Tools | Windows Rust target | `cl`, then `vswhere` for the VC tools component | Install Microsoft's signed Visual Studio Build Tools C++ workload, then re-probe. |
| Node.js | `GUI` or `WEB` selected | `node --version` | Install the supported Node.js LTS from an official, checksum-verified host archive, then re-probe. |
| pnpm | `GUI` or `WEB` selected | `pnpm --version` | Use Node's npm client to install stable `pnpm@latest` from the official npm registry into a user-level prefix, then re-probe. |

An existing Rust toolchain below MSRV or using a prerelease channel is incompatible, not missing. Stop rather than silently replacing it. Existing Node.js or pnpm versions must also satisfy the real frontend plan; presence alone is only the first-development environment gate.

## Installation safeguards

- Rust uses the architecture/libc-matched `rustup-init` from `https://static.rust-lang.org/rustup/dist`, verifies the adjacent SHA-256 file, installs the minimal stable profile, and re-probes.
- Node.js uses a supported LTS archive from `https://nodejs.org/dist`, verifies `SHASUMS256.txt`, installs into a user-level directory, and re-probes.
- pnpm is installed only for GUI/WEB through the npm client delivered with Node.js. npm verifies registry integrity metadata; the gate never executes downloaded text, disables TLS, or selects prerelease pnpm.
- Windows MSVC uses `https://aka.ms/vs/17/release/vs_BuildTools.exe`, requires a valid Microsoft Authenticode signature, installs `Microsoft.VisualStudio.Workload.VCTools`, and re-probes.
- Existing tools are not silently upgraded. Installer, checksum, signature, elevation, restart, policy, linker, registry-integrity, or post-install probe failures block development.

## Evidence record

Record the host, selected interfaces, tool requirement status, probe commands, observed versions or `Missing`, installation sources and changes, post-install probes, final result, and other platforms as `Unverified`. Redact tokens and unnecessary home-directory paths. This evidence does not replace project build, test, artifact, smoke, E2E, or human-review evidence.

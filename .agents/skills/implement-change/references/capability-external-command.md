# External Command Capability

Use this recipe only when the approved core loop must invoke a program that cannot be replaced by a library or operating-system facility with a smaller failure surface.

## Scope Gate

Confirm all of the following before implementation:

- The external program, supported versions and discovery method are explicit.
- Arguments and allowed executable paths are bounded; arbitrary shell text is not accepted as a shortcut.
- Timeout, cancellation, exit-status, stdout/stderr and side-effect behavior are defined.
- Missing executable and failed execution have stable user-visible errors.

If these facts are unresolved, stop and return to `$define-product`.

## Boundary

- Use `tokio::process::Command` and enable only Tokio's `process` feature. Add `time` only when the approved behavior includes a timeout.
- Invoke the executable directly with an argument vector. Do not construct `sh -c`, `cmd /C`, PowerShell or another shell command line unless shell semantics are the explicit product requirement.
- Executable discovery, process spawning and raw I/O stay in an adapter or infrastructure module. Core owns the domain request and interpretation of the normalized result.
- Do not expose `tokio::process::Child`, `JoinHandle` or operating-system process handles in the public domain API.

## Failure And Safety Rules

- A missing executable maps to the external dependency category and base exit code `6`.
- A launched process returning failure maps according to the product's stable domain error; do not report it as successful merely because spawning succeeded.
- Bound captured output when the child can produce untrusted or large data.
- Define child ownership on timeout or cancellation. Do not leave an untracked background process.
- Destructive child operations require explicit approval semantics inherited from the CLI contract.
- Never include secrets or unnecessary full command lines in logs or JSON errors.

## Required Verification

- Unit test the core interpretation of normalized successful and failed process results.
- Black-box test the real adapter with a controlled fixture executable where portable and safe.
- Test missing dependency, non-zero status, timeout when applicable, and invalid arguments.
- Verify stdout/stderr separation and stable JSON/exit-code behavior.
- Test only on the current native platform unless real evidence is collected elsewhere; mark other platforms `Unverified`.

## Exit Condition

If a reliable library replaces the external program or the core loop no longer invokes it, remove Tokio `process`/`time` features and the process adapter. Do not retain a generic command runner for hypothetical reuse.

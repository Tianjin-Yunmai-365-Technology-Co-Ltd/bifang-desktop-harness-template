# File Operations Capability

Use this recipe only when the approved core loop reads or writes files. The existence of this reference does not place file operations in every initialized project.

## Scope Gate

Confirm all of the following before implementation:

- The product specification names the file or directory input/output.
- Read-only versus mutating behavior is explicit.
- Overwrite, collision, partial-write, permission and recovery behavior are defined.
- The highest-risk data-loss path has an observable expected result.

If these facts are unresolved, stop and return to `$define-product`.

## Boundary

- Paths crossing the core boundary use `PathBuf`, `Path` or `OsString`; do not assume UTF-8 or concatenate separators manually.
- Domain validation and overwrite policy belong in core.
- User prompts, confirmation flags, JSON rendering and exit-code mapping belong in the adapter.
- Tokio remains the async standard. Enable only the `fs` feature for async filesystem APIs and `io-util` only when async reader/writer extension traits are actually used.
- Do not add a filesystem abstraction trait until at least two implementations or a concrete testability problem exists.

## Mutation Safety

- Reads must distinguish not found, permission denied, invalid input and malformed content where the product can act differently.
- Writes must not overwrite an existing target without an explicit approved policy and CLI flag.
- When partial output would be harmful, write to a sibling temporary file, flush as required by the product reliability target, and replace the destination only after success.
- Cleanup must not recursively target unresolved variables, broad directories or paths outside the approved operation.
- Error messages and JSON details must not expose unnecessary absolute host paths.

## Required Verification

- Core success-path test for the approved file transformation or validation.
- Highest-risk failure test, normally collision, partial write, invalid content or permission failure.
- CLI black-box test for JSON output, stderr separation and stable exit code.
- Cross-platform tests must construct paths with platform APIs. Untested platforms remain `Unverified`.
- Mutating acceptance tests operate only in an isolated temporary directory and verify both output and preservation of pre-existing data.

## Exit Condition

If the product no longer reads or writes files, remove the capability-specific feature, dependency, tests and code. Preserve only the general path and data-loss rules inherited from the Harness.

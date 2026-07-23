# Rust stdio MCP baseline

Read this reference only after an explicit downstream request has passed the MCP scope gate.

## Fixed defaults

- Use the official Rust MCP SDK family, `rmcp`, with Tokio.
- Start stdio serving from a Tokio current-thread async entry and keep transport/tool/core calls async by default. Ordinary concurrent requests do not justify `rt-multi-thread`.
- Use a local stdio server managed by the MCP host; do not listen on a port.
- Disable default features and enable only the server, macros, and stdio transport capabilities required by the approved tool set.
- Keep a separate MCP binary boundary when Cargo must enforce protocol dependencies and process lifecycle.
- Make the adapter depend on shared core. Never make core depend on MCP or invoke core through CLI text.
- Resolve and lock the actual compatible stable versions when invoked. An undeclared crate MSRV is unknown, not compatible evidence.

## Required design inputs

For every tool, record:

- stable name and concise purpose;
- target host or hosts;
- strict input schema and structured result;
- shared-core operation and domain error mapping;
- read/write/execute/destructive behavior;
- idempotency and external/open-world reach;
- required approval or hard authorization control;
- timeout, cancellation, retry, and partial-result behavior;
- sensitive inputs or outputs that must be redacted.

## Protocol and security rules

- Reserve stdout for MCP protocol messages and write diagnostics to stderr.
- Treat tool annotations as hints; enforce permissions in core/platform boundaries.
- Prefer stable resource IDs and allow callers to ignore future result fields.
- Keep the tool count limited to the real core loop.
- Reject invalid input before side effects.
- Make destructive or non-retryable effects explicit in descriptions and policy.
- Exit cleanly when stdin closes; do not survive as an orphaned background process.
- Do not block the stdio runtime with synchronous I/O, sleeps, process waits or CPU-heavy work. Consider `spawn_blocking`, dedicated threads or a multi-thread runtime only for measured CPU-intensive work with bounded concurrency and cancellation evidence. Replace blocking-only dependencies with async capabilities or stop for a scope/hard-rule exception.

## Minimum evidence

- Tool discovery returns only the approved tools and schemas.
- A target client can invoke the core success path.
- The highest-risk domain failure retains its stable error identity.
- Malformed arguments and permission denial do not produce side effects.
- stdout remains protocol-clean while diagnostics use stderr.
- EOF, cancellation, and timeout behavior are bounded where applicable.
- The actual release binary starts under a real inspector or target host when available.
- Rust MSRV and each claimed native platform have actual evidence; otherwise mark them `Unverified`.

## Exit conditions

Evaluate a different SDK or transport only when the official SDK cannot meet the approved protocol, MSRV, host, or platform requirement. Remote or Streamable HTTP support is a separate scope decision involving lifecycle, authentication, networking, and deployment.

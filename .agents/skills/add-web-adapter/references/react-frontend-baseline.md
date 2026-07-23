# React frontend baseline

This is the shared frontend baseline for WEB and the frontend portion of Tauri GUI adapters.

## Fixed stack

- React and TypeScript for frontend application and component code.
- Mantine UI (`@mantine/core` and `@mantine/hooks`) for the component and theme foundation. Add other Mantine packages only when an approved screen needs them.
- TanStack Router (`@tanstack/react-router`) as the only application routing system.
- TanStack Query (`@tanstack/react-query`) for remote, server and other asynchronous resource state, including request lifecycle, caching and invalidation.
- Jotai (`jotai`) for client-only state that genuinely needs to be shared across components.

Use the latest mutually compatible stable releases available when the adapter is implemented. “Latest” never authorizes prereleases, an unsupported Node/browser/WebView target, skipping a migration, ignoring security advisories or bypassing the locked production build.

## State ownership

| State | Owner |
|---|---|
| URL, route params, validated search params and navigation | TanStack Router |
| Remote/server data, request status, cache, retries and invalidation | TanStack Query |
| Local component-only interaction | React component state |
| Cross-component client/interaction state with no server authority | Jotai |
| Domain rules, durable records and authoritative application state | Shared core/store behind the adapter boundary |

Do not mirror a Query result into Jotai, place durable domain state in atoms, or use route state as a second persistence layer. Derive views from the owning source.

## UI and architecture

- Start with Mantine components, layout primitives, focus behavior and theme tokens. A custom component must represent an approved interaction or styling need that Mantine composition cannot express.
- Keep route definitions and loaders narrow. Integrate TanStack Router loaders with TanStack Query where prefetching prevents waterfalls, but keep a single QueryClient/cache.
- Use Jotai only after local component state or URL/search state is insufficient; keep atoms small and purpose-named.
- Frontend code consumes narrow typed adapter APIs. It does not contain business rules, migrations, platform-independent validation or a second durable store.
- Package local frontend assets for local WEB/Tauri by default. Remote content, telemetry, cookies, authentication and public deployment require explicit scope.

## Required evidence

- Use pnpm, record its version, and commit `pnpm-lock.yaml` with the selected package versions and Node/browser/WebView compatibility evidence.
- Run formatting, TypeScript typecheck, lint, non-empty component/route/query/state tests and a locked production build.
- Test route not-found/error boundaries, Query loading/error/refetch/invalidation, Jotai transitions, keyboard-only use and relevant accessibility semantics.
- Use a real built frontend in the target browser or packaged Tauri application for the approved critical flow.

## Recommendation boundary

The fixed stack also fixes pnpm as the package manager. It does not preselect the build tool, backend HTTP framework, schema/validation library, form library, icons, charts, test runner, mocking library, persistence, authentication or deployment provider. Recommend those only when a real downstream requirement makes the choice necessary, and apply dependency admission and verification rules.

Any replacement of a fixed-stack library requires a hard-rule exception ADR with the failed constraint, risk, scope, alternative evidence and recovery/migration criteria.

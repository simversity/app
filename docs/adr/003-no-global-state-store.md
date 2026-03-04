# ADR 003: No global state store (Redux, Zustand, etc.)

## Date

2025-01-15 (amended 2026-03-03)

## Status

Accepted

## Context

The frontend needs to manage server state (conversations, courses, user profile), local UI state (streaming status, sidebar open/closed, draft messages), and auth state (session). Many React apps use a global state store (Redux, Zustand, Jotai) to centralize this.

## Decision

Use TanStack Query for server state and React hooks (`useState`, `useReducer`) for local state. No global state store.

## Rationale

- **Server state is not global state**: The vast majority of "state" in Simversity is server-derived (conversations, courses, progress). TanStack Query handles caching, invalidation, deduplication, and background refetching — all things a global store would need to implement manually.
- **Local state is component-scoped**: Streaming status, draft messages, and sidebar state are inherently tied to specific components or routes. Lifting them to a global store adds indirection without benefit.
- **Simpler mental model**: With TanStack Query, the data flow is: component → `useQuery(key)` → cache → API. There's no action/dispatch/selector/middleware chain. New developers can trace data flow by reading the component.
- **Streaming state machine**: The most complex local state (SSE streaming) is managed by `useStreamingChat` with `useReducer`. Both `useConversation` and `useObserver` compose it — each gets its own independent reducer instance, so conversation messages and observer messages are intentionally isolated state machines. The reducer is testable in isolation without React.
- **Auth via Better-Auth**: Session state is managed by `useSession()` from Better-Auth's React client, which handles its own caching and refresh cycle.
- **Bundle size**: No additional dependency for state management. TanStack Query is already required for data fetching.

## Consequences

- **Cross-cutting concerns use Context/libraries**: Toast notifications (`sonner`) and theme state (`next-themes`) provide app-wide state via React Context — exactly the pattern predicted at decision time. These are narrow, self-contained concerns that don't warrant a global store.
- **TanStack Query handles global error coordination**: The `QueryCache` and `MutationCache` in `src/lib/query-client.ts` implement `onError` handlers that redirect on 401, show toasts on 403/429, and handle network errors. This centralizes error UI at the query layer rather than in a global store or in individual components.
- **Query key discipline required**: Cache invalidation depends on consistent query keys. The `src/lib/query-keys.ts` factory pattern mitigates this, but a typo in a key string could cause stale data.
- **No time-travel debugging**: Redux DevTools' state inspection and time-travel aren't available. TanStack Query DevTools provide cache inspection but not action replay.

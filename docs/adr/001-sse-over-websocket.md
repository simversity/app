# ADR 001: SSE over WebSocket for AI streaming

## Date

2025-01-15 (amended 2026-03-03)

## Status

Accepted

## Context

Simversity streams AI responses from NEAR AI Cloud to the browser in real time. The two main options for server-push are Server-Sent Events (SSE) and WebSockets.

## Decision

Use SSE (Server-Sent Events) for all streaming AI responses.

## Rationale

- **Unidirectional fit**: AI streaming is inherently server-to-client. The client sends a POST to initiate, then receives a stream of deltas. WebSocket's bidirectional channel is unnecessary overhead.
- **HTTP semantics**: SSE rides on standard HTTP, which means existing middleware (auth, CORS, rate limiting, compression, body limits) applies without modification. WebSocket upgrades bypass many of these.
- **Simpler error model**: SSE reconnects automatically on network failure. WebSocket requires manual reconnection logic, heartbeats, and state synchronization.
- **Hono native support**: Hono provides `streamSSE()` out of the box. WebSocket support exists but requires additional setup and doesn't integrate with Hono's middleware chain as cleanly.
- **Proxy compatibility**: SSE works through standard HTTP reverse proxies (Railway, Cloudflare) without special configuration. WebSocket requires proxy-level upgrade support.
- **OpenAI SDK pattern**: The upstream NEAR AI / OpenAI API itself uses SSE for streaming, so the data format aligns naturally.

## Consequences

- **No unsolicited push**: The server cannot push messages without a client-initiated request. Inline observer nudges are sent on the same SSE stream as the student response (triggered after multi-agent turns), and the observer panel uses a separate POST-initiated SSE stream at `/api/conversations/:id/observer`.
- **Idle timeout tuning required**: `Bun.serve()` defaults to a short idle timeout that would kill long AI streams. The server sets `idleTimeout: 120` explicitly. Additionally, NEAR AI Cloud can stall mid-stream, so the client implements an inactivity timeout (`INACTIVITY_TIMEOUT_MS = 60_000`) that resets on each chunk and aborts if the upstream hangs.
- **Abort propagation**: SSE streams require explicit abort handling — the server listens for `stream.onAbort()` to cancel the upstream AI request, and the client manages `AbortController` lifecycle via `useStreamingChat`.
- Maximum connection limit per browser origin (6 in HTTP/1.1, unlimited in HTTP/2). Acceptable since users typically have one active stream.
- If bidirectional real-time features are needed in the future (e.g., collaborative editing), WebSocket would need to be added alongside SSE.

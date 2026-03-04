# ADR 006: Sequential multi-agent responses with no orchestrator

## Date

2026-03-03

## Status

Accepted

## Context

Simversity scenarios can have multiple AI student agents in a single conversation. When a teacher sends a message, one or more agents may need to respond. The system needs a turn-taking strategy and an addressing mechanism.

Design questions:
1. Should agents respond sequentially (one at a time) or in parallel?
2. Should an orchestrator agent decide who speaks, or should addressing be deterministic?
3. How should the observer handle multi-agent dynamics?

## Decision

Agents respond **sequentially** on a single SSE stream, with **regex word-boundary name matching** for direct addressing and **no orchestrator agent**.

## Rationale

- **Natural conversation feel**: Sequential responses on one stream mirror how students respond in a real classroom — one at a time. Parallel responses arriving simultaneously would feel artificial and be harder to read.
- **SSE constraint**: A single POST produces a single SSE stream. Sequential agent responses (`delta` → `done` → `delta` → `done`) fit naturally. Parallel responses would require either multiple SSE streams (complexity for the client) or interleaved chunks with agent IDs (parsing complexity).
- **Deterministic addressing**: `detectAddressedAgents()` in `server/lib/agent-detection.ts` uses case-insensitive regex word-boundary matching on persona names. If the teacher mentions "Riley", only Riley responds. If no names are detected, all agents respond. This is predictable and transparent — no LLM call needed to decide who speaks.
- **No orchestrator overhead**: An orchestrator agent would add latency (an extra LLM call per turn to decide who speaks), cost, and a failure mode. The regex approach is instant, free, and deterministic.
- **Inline nudges**: After every `NUDGE_EVERY_N_TURNS` teacher turns (default: 3) in multi-agent scenarios, an inline observer nudge is appended to the SSE stream as an `observer_nudge` event. This gives the teacher feedback without requiring them to open the observer panel.
- **Qualitative-only observer**: The observer prompt explicitly prohibits numeric scores ("Never assign numeric scores or grades"). Feedback is structured around research-grounded constructs (Snapshot of Student Thinking, Instructor Moves, etc.) drawn from a 13-paper reference list. This prevents gamification and keeps feedback focused on pedagogical reflection. The group-aware observer adds an 8th construct for multi-agent dynamics (group facilitation, equity of voice).

## Consequences

- **No simultaneous cross-student interaction**: Students cannot interrupt each other or respond to each other in real time. Each agent sees the full conversation history but responds independently.
- **Latency scales with agent count**: If 3 agents are addressed, the teacher waits for 3 sequential LLM completions. This is acceptable for 2-3 agents but would degrade at higher counts.
- **Name collisions**: If two agents have the same first name, both respond when that name is mentioned. In practice, scenario authors choose distinct names.
- **No score-based progress tracking**: Without numeric scores, progress tracking shows conversation counts and completion status rather than performance metrics. This is intentional — the research literature suggests qualitative feedback is more effective for teacher professional development.

# ADR 004: NEAR AI Cloud as AI provider

## Date

2026-03-03

## Status

Accepted

## Context

Simversity needs a hosted LLM inference API for generating student persona responses and observer feedback. Options include OpenAI, Anthropic, Google AI, self-hosted models, and multi-provider gateways. The system needs to support multiple model families (DeepSeek, Claude, GPT, Gemini, Qwen) for admin-selectable model choice per scenario.

## Decision

Use NEAR AI Cloud as the sole inference provider, accessed via the standard OpenAI SDK (`openai` npm package) pointed at `https://cloud-api.near.ai/v1`.

## Rationale

- **Multi-model through one gateway**: NEAR AI Cloud exposes DeepSeek, Claude, GPT, Gemini, Qwen, and other models through a single OpenAI-compatible API. One API key and one base URL provides access to all providers, avoiding per-provider SDK integration.
- **OpenAI SDK compatibility**: The API accepts standard `chat.completions.create()` calls with `stream: true`. No custom SDK or client library is needed — just `new OpenAI({ baseURL, apiKey })`. This means the migration path to direct OpenAI or another compatible provider is a one-line base URL change.
- **TEE-backed inference**: All models run in Trusted Execution Environments (hardware-isolated enclaves), providing verifiable inference. This is relevant for academic integrity — educators can trust that conversation data isn't used for training.
- **Dynamic model listing**: The `/model/list` endpoint returns available models with pricing and context window metadata. The frontend model selector is populated from live data rather than a hardcoded list. A `FALLBACK_MODELS` array in `server/ai/models.ts` provides offline resilience.
- **Cost**: Competitive pricing with direct provider APIs, especially for budget models (DeepSeek V3.1 at ~$1/M input tokens).

## Consequences

- **Single point of failure**: All AI functionality depends on NEAR AI Cloud availability. The `MOCK_AI=1` flag enables fully offline development and CI testing via a local mock server.
- **Model ID format**: Models use `org/model` format (e.g., `deepseek-ai/DeepSeek-V3.1`) rather than OpenAI's flat names. This is transparent to the application code but affects the `MODEL_ALLOWLIST` configuration.
- **No provider-specific features**: Advanced features like OpenAI's function calling with strict schemas, Anthropic's prompt caching, or Google's grounding are not available through the compatibility layer. Standard `chat.completions` with `stream: true` is the supported surface.
- **Retry and timeout tuning**: The client sets a 60-second timeout. `withRetry()` in `server/lib/retry.ts` handles transient failures with exponential backoff. The inactivity timeout on the client side (60s) guards against upstream hangs.

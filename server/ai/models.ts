import { env, MODEL_ALLOWLIST } from '../lib/env';
import { log } from '../lib/logger';
import { NEARAI_BASE_URL } from './client';

export type ModelInfo = {
  id: string;
  label: string;
  context: string;
  tier: '$' | '$$' | '$$$';
};

type NearAIModel = {
  modelId: string;
  costPerImage?: { amount: number };
  inputCostPerToken?: { amount: number; scale: number };
  outputCostPerToken?: { amount: number; scale: number };
  metadata?: { modelDisplayName?: string; contextLength?: number };
};

function costTier(inputPerM: number, outputPerM: number): '$' | '$$' | '$$$' {
  const combined = inputPerM + outputPerM;
  if (combined < 5) return '$';
  if (combined < 20) return '$$';
  return '$$$';
}

const FALLBACK_MODELS: ModelInfo[] = [
  {
    id: 'deepseek-ai/DeepSeek-V3.1',
    label: 'DeepSeek V3.1',
    context: '128K',
    tier: '$',
  },
  {
    id: 'anthropic/claude-opus-4-6',
    label: 'Claude Opus 4.6',
    context: '200K',
    tier: '$$$',
  },
  {
    id: 'anthropic/claude-sonnet-4-5',
    label: 'Claude Sonnet 4.5',
    context: '200K',
    tier: '$$',
  },
  {
    id: 'google/gemini-3-pro',
    label: 'Gemini 3 Pro',
    context: '1000K',
    tier: '$$',
  },
  { id: 'openai/gpt-5.2', label: 'GPT-5.2', context: '400K', tier: '$$' },
  {
    id: 'openai/gpt-oss-120b',
    label: 'GPT OSS 120B',
    context: '131K',
    tier: '$',
  },
  {
    id: 'Qwen/Qwen3-30B-A3B-Instruct-2507',
    label: 'Qwen3 30B',
    context: '262K',
    tier: '$',
  },
  { id: 'zai-org/GLM-5-FP8', label: 'GLM 5', context: '203K', tier: '$' },
];

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
let cachedModels: ModelInfo[] | null = null;
let cachedAt = 0;
let inflight: Promise<ModelInfo[]> | null = null;

/** @internal Reset the model cache — for testing only. */
export function _resetModelCache() {
  cachedModels = null;
  cachedAt = 0;
  inflight = null;
}

function formatContext(tokens: number): string {
  return `${Math.round(tokens / 1000)}K`;
}

function toPerMillion(amount: number, scale: number): number {
  return amount / 10 ** (scale - 6);
}

export async function fetchModels(): Promise<ModelInfo[]> {
  if (cachedModels && Date.now() - cachedAt < CACHE_TTL) {
    return cachedModels;
  }

  // Single-flight: reuse an in-progress fetch to prevent cache stampede
  if (inflight) return inflight;
  inflight = fetchModelsInner().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function fetchModelsInner(): Promise<ModelInfo[]> {
  try {
    const res = await fetch(`${NEARAI_BASE_URL}/model/list`, {
      headers: { Authorization: `Bearer ${env.NEARAI_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) throw new Error(`NEAR AI responded ${res.status}`);

    const data: unknown = await res.json();
    const modelList =
      data != null &&
      typeof data === 'object' &&
      'models' in data &&
      Array.isArray((data as { models?: unknown }).models)
        ? (data as { models: NearAIModel[] }).models
        : [];
    const models: ModelInfo[] = modelList
      .filter((m: NearAIModel) => {
        const imgCost = m.costPerImage?.amount ?? 0;
        return imgCost === 0;
      })
      .map((m: NearAIModel) => {
        const inputPerM = toPerMillion(
          m.inputCostPerToken?.amount ?? 0,
          m.inputCostPerToken?.scale ?? 0,
        );
        const outputPerM = toPerMillion(
          m.outputCostPerToken?.amount ?? 0,
          m.outputCostPerToken?.scale ?? 0,
        );
        return {
          id: m.modelId,
          label: m.metadata?.modelDisplayName || m.modelId,
          context: formatContext(m.metadata?.contextLength || 0),
          tier: costTier(inputPerM, outputPerM),
        };
      });

    if (models.length > 0) {
      cachedModels = applyAllowlist(models);
      cachedAt = Date.now();
      return cachedModels;
    }
  } catch (err) {
    log.error(
      { error: (err as Error).message },
      'Failed to fetch NEAR AI models, using fallback',
    );
  }

  return cachedModels || applyAllowlist(FALLBACK_MODELS);
}

function applyAllowlist(models: ModelInfo[]): ModelInfo[] {
  if (MODEL_ALLOWLIST.length === 0) return models;
  const allowed = new Set(MODEL_ALLOWLIST);
  return models.filter((m) => allowed.has(m.id));
}

const DEFAULT_CONTEXT_LIMIT = 32_000;

/** Parse a context string like "128K" or "1000K" into a token count. */
function parseContextString(ctx: string): number {
  const match = ctx.match(/^(\d+)K$/i);
  return match ? Number.parseInt(match[1], 10) * 1000 : DEFAULT_CONTEXT_LIMIT;
}

/**
 * Return the context window size (in tokens) for the given model ID.
 * Uses cached model metadata when available, falls back to FALLBACK_MODELS,
 * then to 32K as a safe default.
 */
export function getContextLimit(modelId: string): number {
  // Check cached models first
  if (cachedModels) {
    const model = cachedModels.find((m) => m.id === modelId);
    if (model) return parseContextString(model.context);
  }
  // Check fallback models
  const fallback = FALLBACK_MODELS.find((m) => m.id === modelId);
  if (fallback) return parseContextString(fallback.context);
  return DEFAULT_CONTEXT_LIMIT;
}

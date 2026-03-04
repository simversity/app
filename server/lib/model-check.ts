import { MODEL_ALLOWLIST } from './env';

/** Returns true if the model is permitted by MODEL_ALLOWLIST (empty = allow all). */
export function isModelAllowed(modelId: string): boolean {
  if (MODEL_ALLOWLIST.length === 0) return true;
  return MODEL_ALLOWLIST.includes(modelId);
}

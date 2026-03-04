import OpenAI from 'openai';
import { env } from '../lib/env';

export const NEARAI_BASE_URL = 'https://cloud-api.near.ai/v1';

const mockAiPort = process.env.MOCK_AI_PORT || '4100';
const useMockAi = process.env.MOCK_AI === '1';

if (useMockAi && process.env.NODE_ENV === 'production') {
  throw new Error('MOCK_AI must not be enabled in production');
}

export const openai = new OpenAI({
  baseURL: useMockAi ? `http://127.0.0.1:${mockAiPort}/v1` : NEARAI_BASE_URL,
  apiKey: useMockAi ? 'mock-key' : env.NEARAI_API_KEY,
  timeout: 60_000,
});

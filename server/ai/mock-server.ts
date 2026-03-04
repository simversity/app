/**
 * Lightweight mock OpenAI-compatible server for E2E tests.
 * Returns deterministic streaming responses without calling a real AI API.
 *
 * Usage: MOCK_AI=1 bun server/ai/mock-server.ts
 * Listens on port 4100 by default (MOCK_AI_PORT to override).
 */
import { Hono } from 'hono';
import { log } from '../lib/logger';

const app = new Hono();

const MOCK_RESPONSES = [
  "That's an interesting point! I think natural selection works because organisms that are better adapted survive longer. But doesn't that mean they choose to adapt? Like, a giraffe stretches its neck to reach leaves and then passes that longer neck to its babies?",
  "Hmm, I'm not sure I fully understand. So you're saying the traits aren't chosen by the organism? But if the environment changes, don't the organisms need to change too? I thought that's what evolution means — that species change on purpose to survive.",
  "Oh wait, so the variation already exists before the selection happens? I think I was confused because I thought the organism decides which traits to develop. So it's more like... some giraffes are just born with longer necks, and those ones happen to survive better?",
];

let callCount = 0;

app.post('/v1/chat/completions', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const stream = body.stream;

  const response = MOCK_RESPONSES[callCount % MOCK_RESPONSES.length];
  callCount++;

  if (!stream) {
    return c.json({
      id: `mock-${crypto.randomUUID()}`,
      object: 'chat.completion',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: response },
          finish_reason: 'stop',
        },
      ],
    });
  }

  // Streaming response: split into chunks
  const words = response.split(' ');
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < words.length; i++) {
        const text = (i === 0 ? '' : ' ') + words[i];
        const chunk = {
          id: `mock-${crypto.randomUUID()}`,
          object: 'chat.completion.chunk',
          choices: [
            {
              index: 0,
              delta: { content: text },
              finish_reason: null,
            },
          ],
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
        );
        // Small delay to simulate streaming
        await new Promise((r) => setTimeout(r, 5));
      }
      // Send finish chunk
      const finishChunk = {
        id: `mock-${crypto.randomUUID()}`,
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      };
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(finishChunk)}\n\n`),
      );
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

// Model list endpoint
app.get('/v1/models', (c) => {
  return c.json({
    data: [
      { id: 'mock-model', object: 'model', owned_by: 'mock' },
      {
        id: 'deepseek-ai/DeepSeek-V3.1',
        object: 'model',
        owned_by: 'mock',
      },
    ],
  });
});

const port = Number(process.env.MOCK_AI_PORT) || 4100;
log.info({ port }, 'Mock AI server listening');
export default { port, fetch: app.fetch };

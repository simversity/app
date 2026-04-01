import type { SSEStreamingApi } from 'hono/streaming';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { openai } from '../ai/client';
import { getContextLimit } from '../ai/models';
import { buildNudgePrompt } from '../ai/prompts';
import { STUDENT_TOOLS } from '../ai/tools';
import type { db } from '../db';
import { callAIWithRetry } from './ai-helpers';
import {
  ErrorMessage,
  NUDGE_CONTEXT_RECENT_MESSAGES,
  NUDGE_EVERY_N_TURNS,
  NUDGE_MAX_TOKENS,
} from './constants';
import type { LoadedAgent } from './conversation-helpers';
import { buildAgentChatMessages } from './conversation-helpers';
import { env } from './env';
import type { FileRef } from './file-context';
import { attachFiles } from './file-context';
import { log } from './logger';
import { checkDailyBudget } from './shared-budgets';
import { streamAndSaveAIResponse } from './streaming';
import { trimMessagesToFit } from './token-estimate';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Shared context for all handler functions. */
export interface ConversationContext {
  conversationId: string;
  userId: string;
  resolvedModel: string;
}

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | string;
  content: string | { type: string; [key: string]: unknown }[];
};

/** Stream a single-agent AI response and save it. */
export async function handleSingleAgentResponse(
  ctx: ConversationContext & {
    stream: SSEStreamingApi;
    chatMessages: ChatMessage[];
    teacherSortOrder: number;
    agentPersonaId: string | null;
    agentPersonaName: string;
    afterSave: (tx: Tx) => Promise<void>;
    fileRefs?: FileRef[];
  },
) {
  const trimmedMessages = trimMessagesToFit(
    ctx.chatMessages,
    getContextLimit(ctx.resolvedModel) - env.NEARAI_MAX_TOKENS,
  );

  // Inject file references AFTER trimming so they are never dropped.
  // TODO(file-tokens): Base64 image data URIs (up to 5MB each via MAX_IMAGE_SIZE)
  // are injected here without accounting for their token cost. Multiple large
  // images could push the total payload past the model's context window, causing
  // an API error. A correct fix requires knowing the model's vision token pricing
  // (which varies by provider/model) to reserve space in the trim budget. For now,
  // the practical limit is bounded by the 5MB-per-image cap and typical scenario
  // usage (1-3 images).
  const finalMessages =
    ctx.fileRefs && ctx.fileRefs.length > 0
      ? attachFiles(
          trimmedMessages as { role: string; content: string }[],
          ctx.fileRefs,
        )
      : trimmedMessages;

  const abortController = new AbortController();
  ctx.stream.onAbort(() => abortController.abort());

  const aiStream = await callAIWithRetry(
    () =>
      openai.chat.completions.create(
        {
          model: ctx.resolvedModel,
          max_tokens: env.NEARAI_MAX_TOKENS,
          messages: finalMessages as ChatCompletionMessageParam[],
          tools: STUDENT_TOOLS,
          tool_choice: 'auto',
          stream: true as const,
        },
        { signal: abortController.signal },
      ),
    {
      stream: ctx.stream,
      errorMessage: ErrorMessage.STUDENT_TROUBLE,
      timeoutMessage: ErrorMessage.STUDENT_TIMEOUT,
      rateLimitMessage: ErrorMessage.STUDENT_RATE_LIMITED,
      logContext: { conversationId: ctx.conversationId, userId: ctx.userId },
      logLabel: 'AI call failed after retries',
    },
  );
  if (!aiStream) {
    checkDailyBudget.release(ctx.userId);
    return;
  }

  await streamAndSaveAIResponse({
    stream: ctx.stream,
    aiStream,
    conversationId: ctx.conversationId,
    table: 'message',
    counterField: 'messageCount',
    sortOrder: ctx.teacherSortOrder + 1,
    errorLabel: ErrorMessage.STUDENT_TROUBLE,
    emptyLabel: ErrorMessage.STUDENT_EMPTY,
    extraInsert: { agentId: ctx.agentPersonaId },
    extraDone: {
      agentId: ctx.agentPersonaId,
      agentName: ctx.agentPersonaName,
    },
    abortController,
    userId: ctx.userId,
    onAIFailure: () => checkDailyBudget.release(ctx.userId),
    afterSave: ctx.afterSave,
    toolContinuation: {
      model: ctx.resolvedModel,
      messages: finalMessages as unknown as Record<string, unknown>[],
      tools: STUDENT_TOOLS,
      maxTokens: env.NEARAI_MAX_TOKENS,
    },
  });
}

/** Stream sequential multi-agent AI responses and return turn responses. */
export async function handleMultiAgentResponse(
  ctx: ConversationContext & {
    stream: SSEStreamingApi;
    respondingAgents: LoadedAgent[];
    agents: LoadedAgent[];
    recentMessages: {
      role: string;
      content: string;
      agentId?: string | null;
    }[];
    content: string;
    activityContext?: string | null;
    teacherSortOrder: number;
    afterSave: (tx: Tx) => Promise<void>;
    fileRefs?: FileRef[];
  },
): Promise<{
  turnResponses: { role: 'assistant'; content: string; agentId: string }[];
  nextSortOrder: number;
}> {
  const abortController = new AbortController();
  ctx.stream.onAbort(() => abortController.abort());

  const turnResponses: {
    role: 'assistant';
    content: string;
    agentId: string;
  }[] = [];
  let nextSortOrder = ctx.teacherSortOrder + 1;

  for (let i = 0; i < ctx.respondingAgents.length; i++) {
    if (ctx.stream.aborted) break;

    const agent = ctx.respondingAgents[i];
    const isLast = i === ctx.respondingAgents.length - 1;

    const rawAgentMessages = buildAgentChatMessages({
      agent,
      agents: ctx.agents,
      recentMessages: ctx.recentMessages,
      userContent: ctx.content,
      extraAssistantMessages: turnResponses,
      activityContext: ctx.activityContext,
    });

    const agentMaxTokens = Math.min(
      Math.max(agent.maxResponseTokens ?? env.NEARAI_MAX_TOKENS, 1),
      env.NEARAI_MAX_TOKENS,
    );
    const trimmedAgentMessages = trimMessagesToFit(
      rawAgentMessages,
      getContextLimit(ctx.resolvedModel) - agentMaxTokens,
    );

    // Inject file references AFTER trimming so they are never dropped.
    // TODO(file-tokens): Same caveat as single-agent path — see above.
    const fileRefs = ctx.fileRefs ?? [];
    const finalAgentMessages =
      fileRefs.length > 0
        ? attachFiles(
            trimmedAgentMessages as { role: string; content: string }[],
            fileRefs,
          )
        : trimmedAgentMessages;

    const createStream = () =>
      openai.chat.completions.create(
        {
          model: ctx.resolvedModel,
          max_tokens: agentMaxTokens,
          messages: finalAgentMessages as ChatCompletionMessageParam[],
          tools: STUDENT_TOOLS,
          tool_choice: 'auto',
          stream: true as const,
        },
        { signal: abortController.signal },
      );

    const aiStream = await callAIWithRetry(createStream, {
      stream: ctx.stream,
      errorMessage: ErrorMessage.STUDENT_TROUBLE,
      timeoutMessage: ErrorMessage.STUDENT_TIMEOUT,
      rateLimitMessage: ErrorMessage.STUDENT_RATE_LIMITED,
      logContext: {
        conversationId: ctx.conversationId,
        userId: ctx.userId,
        agent: agent.personaName,
      },
      logLabel: 'AI call failed for agent',
    });
    if (!aiStream) {
      checkDailyBudget.release(ctx.userId);
      return { turnResponses, nextSortOrder };
    }

    let capturedText = '';
    await streamAndSaveAIResponse({
      stream: ctx.stream,
      aiStream,
      conversationId: ctx.conversationId,
      table: 'message',
      counterField: 'messageCount',
      sortOrder: nextSortOrder,
      errorLabel: ErrorMessage.STUDENT_TROUBLE,
      emptyLabel: ErrorMessage.STUDENT_EMPTY,
      extraInsert: { agentId: agent.personaId },
      extraDone: {
        agentId: agent.personaId,
        agentName: agent.personaName,
        ...(isLast ? {} : { multiAgentContinue: true }),
      },
      abortController,
      userId: ctx.userId,
      onAIFailure: () => checkDailyBudget.release(ctx.userId),
      onComplete: (fullText) => {
        capturedText = fullText;
      },
      afterSave: isLast ? ctx.afterSave : undefined,
      toolContinuation: {
        model: ctx.resolvedModel,
        messages: finalAgentMessages as unknown as Record<string, unknown>[],
        tools: STUDENT_TOOLS,
        maxTokens: agentMaxTokens,
      },
    });

    if (!capturedText || ctx.stream.aborted)
      return { turnResponses, nextSortOrder };

    turnResponses.push({
      role: 'assistant',
      content: capturedText,
      agentId: agent.personaId,
    });
    nextSortOrder++;
  }

  return { turnResponses, nextSortOrder };
}

/** Send an inline observer nudge if conditions are met. */
export async function handleInlineNudge(opts: {
  stream: SSEStreamingApi;
  sc: { observerMode: string | null };
  agents: LoadedAgent[];
  respondingAgents: LoadedAgent[];
  recentMessages: { role: string; content: string; agentId?: string | null }[];
  content: string;
  turnResponses: { role: 'assistant'; content: string; agentId: string }[];
  nextSortOrder: number;
  resolvedModel: string;
}) {
  // Nudges only apply to inline observer mode with multi-agent scenarios.
  // !observerMode covers null/undefined (defaults to panel-like behavior).
  if (
    opts.stream.aborted ||
    !opts.sc.observerMode ||
    opts.sc.observerMode === 'panel' ||
    opts.respondingAgents.length <= 1
  ) {
    return;
  }

  const currentMessageCount = opts.nextSortOrder;
  const teacherTurnCount = Math.floor(
    (currentMessageCount - opts.agents.length) / (opts.agents.length + 1),
  );
  if (teacherTurnCount % NUDGE_EVERY_N_TURNS !== 0) return;

  try {
    const recentForNudge = [
      ...opts.recentMessages.slice(-NUDGE_CONTEXT_RECENT_MESSAGES).map((m) => ({
        role: m.role,
        content: m.content,
        agentName:
          m.role === 'assistant'
            ? opts.agents.find(
                (a) => a.personaId === (m as { agentId?: string }).agentId,
              )?.personaName
            : undefined,
      })),
      { role: 'user', content: opts.content, agentName: undefined },
      ...opts.turnResponses.map((r) => ({
        role: r.role,
        content: r.content,
        agentName: opts.agents.find((a) => a.personaId === r.agentId)
          ?.personaName,
      })),
    ];

    const nudgeMessages = buildNudgePrompt({
      agentNames: opts.agents.map((a) => a.personaName),
      recentExchanges: recentForNudge,
    });

    const nudgeResponse = await openai.chat.completions.create({
      model: opts.resolvedModel,
      max_tokens: NUDGE_MAX_TOKENS,
      messages: nudgeMessages,
    });

    const nudgeText = nudgeResponse.choices[0]?.message?.content?.trim() || '';
    if (nudgeText && nudgeText !== 'NONE') {
      await opts.stream.writeSSE({
        data: JSON.stringify({
          type: 'observer_nudge',
          text: nudgeText,
        }),
        event: 'message',
      });
    }
  } catch (err) {
    log.debug(
      { error: err instanceof Error ? err.message : err },
      'Observer nudge call failed (non-critical)',
    );
  }
}

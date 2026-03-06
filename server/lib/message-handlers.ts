import type { SSEStreamingApi } from 'hono/streaming';
import { openai } from '../ai/client';
import { getContextLimit } from '../ai/models';
import { buildNudgePrompt } from '../ai/prompts';
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

/** Stream a single-agent AI response and save it. */
export async function handleSingleAgentResponse(
  ctx: ConversationContext & {
    stream: SSEStreamingApi;
    chatMessages: {
      role: 'system' | 'user' | 'assistant';
      content: string;
    }[];
    teacherSortOrder: number;
    agentPersonaId: string | null;
    agentPersonaName: string;
    afterSave: (tx: Tx) => Promise<void>;
  },
) {
  const budget = checkDailyBudget;
  const trimmedMessages = trimMessagesToFit(
    ctx.chatMessages,
    getContextLimit(ctx.resolvedModel) - env.NEARAI_MAX_TOKENS,
  );

  const abortController = new AbortController();
  ctx.stream.onAbort(() => abortController.abort());

  const aiStream = await callAIWithRetry(
    () =>
      openai.chat.completions.create(
        {
          model: ctx.resolvedModel,
          max_tokens: env.NEARAI_MAX_TOKENS,
          messages: trimmedMessages,
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
    budget?.release(ctx.userId);
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
    onAIFailure: budget ? () => budget.release(ctx.userId) : undefined,
    afterSave: ctx.afterSave,
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
  },
): Promise<{
  turnResponses: { role: 'assistant'; content: string; agentId: string }[];
  nextSortOrder: number;
}> {
  const budget = checkDailyBudget;
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

    const agentMessages = buildAgentChatMessages({
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
      agentMessages,
      getContextLimit(ctx.resolvedModel) - agentMaxTokens,
    );

    const createStream = () =>
      openai.chat.completions.create(
        {
          model: ctx.resolvedModel,
          max_tokens: agentMaxTokens,
          messages: trimmedAgentMessages,
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
      budget?.release(ctx.userId);
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
      onAIFailure: budget ? () => budget.release(ctx.userId) : undefined,
      onComplete: (fullText) => {
        capturedText = fullText;
      },
      afterSave: isLast ? ctx.afterSave : undefined,
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

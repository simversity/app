import {
  AlertCircle,
  Eye,
  GraduationCap,
  HelpCircle,
  Lightbulb,
  ListOrdered,
  User,
} from 'lucide-react';
import { memo } from 'react';
import { ObserverMessageContent } from '@/components/ObserverMessageContent';
import { Badge } from '@/components/ui/badge';
import type { ChatMessage, ToolCall } from '@/hooks/useStreamingChat';
import { Message, MessageContent } from './message';
import { StreamingDots } from './streaming-dots';

type ChatBubbleVariant = 'conversation' | 'observer';

const variantConfig = {
  conversation: {
    icon: GraduationCap,
    iconSize: 'h-8 w-8',
    innerIconSize: 'h-4 w-4',
    iconBg: 'bg-student/10 text-student',
    nameColor: 'text-student',
    gap: 'gap-3',
  },
  observer: {
    icon: Eye,
    iconSize: 'h-7 w-7',
    innerIconSize: 'h-3.5 w-3.5',
    iconBg: 'bg-observer/10 text-observer-foreground',
    nameColor: 'text-observer-foreground',
    gap: 'gap-2',
  },
} as const;

export const ChatBubble = memo(function ChatBubble({
  message,
  variant = 'conversation',
  onDismissNudge,
}: {
  message: ChatMessage;
  variant?: ChatBubbleVariant;
  onDismissNudge?: (id: string) => void;
}) {
  const isUser = message.role === 'user';
  const isNudge = message.role === 'nudge';
  const config = variantConfig[variant];
  const isCompact = variant === 'observer';

  if (isNudge) {
    return (
      <div className="mx-auto flex max-w-md items-start gap-2 rounded-lg border border-observer/20 bg-observer/5 px-3 py-2 text-sm text-observer-foreground">
        <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p className="flex-1">{message.content}</p>
        {onDismissNudge && (
          <button
            type="button"
            onClick={() => onDismissNudge(message.id)}
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
            aria-label="Dismiss nudge"
          >
            &times;
          </button>
        )}
      </div>
    );
  }

  return (
    <Message from={message.role as 'user' | 'assistant'}>
      <div className={`flex items-start ${config.gap}`}>
        {!isUser && (
          <div
            className={`flex shrink-0 items-center justify-center rounded-full ${config.iconSize} ${config.iconBg}`}
          >
            <config.icon className={config.innerIconSize} />
          </div>
        )}
        <MessageContent
          className={
            isUser
              ? `bg-primary text-primary-foreground rounded-lg ${isCompact ? 'px-3 py-2 text-sm' : 'px-4 py-3'}`
              : isCompact
                ? 'text-sm'
                : ''
          }
        >
          <span className="sr-only">
            {isUser ? 'You' : message.agentName || 'Student'} said:
          </span>
          {!isUser && !isCompact && message.agentName && (
            <p className={`mb-1 text-xs font-semibold ${config.nameColor}`}>
              {message.agentName}
            </p>
          )}
          {isCompact && !isUser && !message.isStreaming ? (
            message.content ? (
              <ObserverMessageContent content={message.content} />
            ) : null
          ) : message.content ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : null}
          {message.isStreaming &&
            !message.content &&
            !message.toolCalls?.length && <StreamingDots />}
          {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
            <ToolCallAnnotations
              toolCalls={message.toolCalls}
              variant={variant}
            />
          )}
        </MessageContent>
        {isUser && (
          <div
            className={`flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ${config.iconSize}`}
          >
            <User className={config.innerIconSize} />
          </div>
        )}
      </div>
    </Message>
  );
});

function ToolCallAnnotations({
  toolCalls,
  variant,
}: {
  toolCalls: ToolCall[];
  variant: ChatBubbleVariant;
}) {
  const isObserver = variant === 'observer';

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {toolCalls.map((tc, idx) => {
        const key = `${tc.name}-${idx}`;
        if (tc.name === 'express_confusion') {
          const args = tc.arguments as {
            topic?: string;
            misconception?: string;
          };
          return (
            <Badge
              key={key}
              variant="outline"
              className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            >
              <HelpCircle className="size-3" />
              Confused: {args.topic}
              {args.misconception && ` \u2014 "${args.misconception}"`}
            </Badge>
          );
        }
        if (tc.name === 'ask_question') {
          const args = tc.arguments as {
            question?: string;
            question_type?: string;
          };
          const typeLabel =
            args.question_type === 'challenging'
              ? 'Challenging'
              : args.question_type === 'off_topic'
                ? 'Off-topic'
                : 'Clarifying';
          return (
            <Badge
              key={key}
              variant="outline"
              className="gap-1 border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400"
            >
              <HelpCircle className="size-3" />
              {typeLabel} question
            </Badge>
          );
        }
        if (tc.name === 'show_reasoning') {
          const args = tc.arguments as { steps?: string[] };
          return (
            <div
              key={key}
              className="w-full rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs"
            >
              <div className="mb-1 flex items-center gap-1 font-medium text-muted-foreground">
                <ListOrdered className="size-3" />
                Student reasoning
              </div>
              <ol className="list-inside list-decimal space-y-0.5 text-muted-foreground">
                {args.steps?.map((step, i) => (
                  <li key={`${i}-${step}`}>{step}</li>
                ))}
              </ol>
            </div>
          );
        }
        if (isObserver && tc.name === 'suggest_technique') {
          const args = tc.arguments as {
            name?: string;
            rationale?: string;
            example?: string;
          };
          return (
            <div
              key={key}
              className="w-full rounded-md border border-observer/20 bg-observer/5 px-3 py-2 text-xs"
            >
              <div className="mb-1 flex items-center gap-1 font-medium text-observer-foreground">
                <Lightbulb className="size-3" />
                Technique: {args.name}
              </div>
              {args.rationale && (
                <p className="text-muted-foreground">{args.rationale}</p>
              )}
              {args.example && (
                <p className="mt-1 italic text-muted-foreground">
                  "{args.example}"
                </p>
              )}
            </div>
          );
        }
        if (isObserver && tc.name === 'highlight_moment') {
          const args = tc.arguments as {
            quote?: string;
            feedback_type?: string;
            suggestion?: string;
          };
          const typeColors = {
            strength: 'border-green-500/30 bg-green-500/5',
            missed_opportunity: 'border-amber-500/30 bg-amber-500/5',
            concern: 'border-red-500/30 bg-red-500/5',
          };
          const color =
            typeColors[args.feedback_type as keyof typeof typeColors] ||
            typeColors.strength;
          return (
            <div
              key={key}
              className={`w-full rounded-md border px-3 py-2 text-xs ${color}`}
            >
              {args.quote && (
                <blockquote className="mb-1 border-l-2 border-current pl-2 italic text-muted-foreground">
                  "{args.quote}"
                </blockquote>
              )}
              <Badge variant="outline" className="mb-1 text-xs">
                {args.feedback_type?.replace('_', ' ')}
              </Badge>
              {args.suggestion && (
                <p className="text-muted-foreground">{args.suggestion}</p>
              )}
            </div>
          );
        }
        if (isObserver && tc.name === 'probe_decision') {
          const args = tc.arguments as {
            question?: string;
            related_moment?: string;
          };
          return (
            <div
              key={key}
              className="w-full rounded-md border border-observer/20 bg-observer/5 px-3 py-2 text-xs"
            >
              <div className="mb-1 flex items-center gap-1 font-medium text-observer-foreground">
                <AlertCircle className="size-3" />
                Reflection prompt
              </div>
              {args.question && <p className="font-medium">{args.question}</p>}
              {args.related_moment && (
                <p className="mt-0.5 text-muted-foreground">
                  Re: {args.related_moment}
                </p>
              )}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

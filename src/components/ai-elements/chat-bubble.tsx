import { Eye, GraduationCap, User } from 'lucide-react';
import { memo } from 'react';
import { ObserverMessageContent } from '@/components/ObserverMessageContent';
import type { ChatMessage } from '@/hooks/useStreamingChat';
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
            <ObserverMessageContent content={message.content} />
          ) : (
            <p className="whitespace-pre-wrap">{message.content}</p>
          )}
          {message.isStreaming && !message.content && <StreamingDots />}
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

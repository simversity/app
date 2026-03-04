import { type ChangeEvent, useCallback, useEffect, useRef } from 'react';
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input';
import { useAppConfig } from '@/hooks/useAppConfig';

const DRAFT_PREFIX = 'simversity:draft:';

type ChatInputFormProps = {
  onSend: (text: string) => void;
  placeholder: string;
  disabled: boolean;
  isStreaming: boolean;
  streamingLabel: string;
  /** localStorage key suffix for draft auto-save (e.g. conversationId). */
  draftKey?: string;
};

export function ChatInputForm({
  onSend,
  placeholder,
  disabled,
  isStreaming,
  streamingLabel,
  draftKey,
}: ChatInputFormProps) {
  const { maxMessageChars } = useAppConfig();
  const storageKey = draftKey ? `${DRAFT_PREFIX}${draftKey}` : null;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Restore draft on mount / key change
  useEffect(() => {
    if (!storageKey || !textareaRef.current) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        textareaRef.current.value = saved;
      }
    } catch (e) {
      console.debug('Draft restore failed:', e);
    }
  }, [storageKey]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      if (!storageKey) return;
      try {
        const val = e.target.value;
        if (val) {
          localStorage.setItem(storageKey, val);
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch (e) {
        console.debug('Draft save failed:', e);
      }
    },
    [storageKey],
  );

  return (
    <PromptInput
      onSubmit={({ text }) => {
        if (text.trim()) {
          onSend(text.trim());
          try {
            if (storageKey) localStorage.removeItem(storageKey);
          } catch (e) {
            console.debug('Draft clear failed:', e);
          }
        }
      }}
    >
      <PromptInputTextarea
        ref={textareaRef}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxMessageChars}
        onChange={handleChange}
      />
      <PromptInputFooter>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {isStreaming
            ? streamingLabel
            : 'Enter to send \u00B7 Shift+Enter for new line'}
        </span>
        <PromptInputSubmit
          disabled={disabled}
          status={isStreaming ? 'streaming' : 'ready'}
        />
      </PromptInputFooter>
    </PromptInput>
  );
}

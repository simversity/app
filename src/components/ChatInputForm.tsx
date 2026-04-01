import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';
import { type ChangeEvent, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input';
import { useAppConfig } from '@/hooks/useAppConfig';
import type { StreamingStatus } from '@/hooks/useStreamingChat';
import { apiFetch, apiUpload } from '@/lib/api';
import { DRAFT_PREFIX } from '@/lib/constants';
import { queryKeys } from '@/lib/query-keys';
import type { UploadedFile } from '@/types/api';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

const ACCEPT = '.pdf,.docx,.doc,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.gif,.webp';

type ChatInputFormProps = {
  onSend: (text: string) => void;
  placeholder: string;
  disabled: boolean;
  isStreaming: boolean;
  streamingLabel: string;
  /** localStorage key suffix for draft auto-save (e.g. conversationId). */
  draftKey?: string;
  /** Current streaming status — used to clear draft only on success. */
  status?: StreamingStatus;
  /** Last user content from state — restored to textarea on error. */
  lastUserContent?: string | null;
  /** Conversation ID — enables file upload when provided. */
  conversationId?: string | null;
};

export function ChatInputForm({
  onSend,
  placeholder,
  disabled,
  isStreaming,
  streamingLabel,
  draftKey,
  status,
  lastUserContent,
  conversationId,
}: ChatInputFormProps) {
  const { maxMessageChars } = useAppConfig();
  const storageKey = draftKey ? `${DRAFT_PREFIX}${draftKey}` : null;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const prevStatusRef = useRef<StreamingStatus | undefined>(status);

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

  // Clear draft on successful stream completion; restore on error
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    if (prev === 'streaming' && status === 'idle') {
      // Stream completed successfully — clear draft
      try {
        if (storageKey) localStorage.removeItem(storageKey);
      } catch (e) {
        console.debug('Draft clear failed:', e);
      }
    } else if (status === 'error' && lastUserContent && textareaRef.current) {
      // Stream failed — restore message so user can retry
      textareaRef.current.value = lastUserContent;
      try {
        if (storageKey) localStorage.setItem(storageKey, lastUserContent);
      } catch (e) {
        console.debug('Draft restore failed:', e);
      }
    }
  }, [status, lastUserContent, storageKey]);

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
    <div className="space-y-2">
      {conversationId && <FileChips conversationId={conversationId} />}
      <PromptInput
        onSubmit={({ text }) => {
          if (text.trim()) {
            onSend(text.trim());
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
          <div className="flex items-center gap-1">
            {conversationId && (
              <AttachButton
                conversationId={conversationId}
                fileInputRef={fileInputRef}
                disabled={disabled}
              />
            )}
            <PromptInputSubmit
              disabled={disabled}
              status={isStreaming ? 'streaming' : 'ready'}
            />
          </div>
        </PromptInputFooter>
      </PromptInput>
      {conversationId && (
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            // Handled by AttachButton's mutation via custom event
            e.target.value = '';
          }}
        />
      )}
    </div>
  );
}

function AttachButton({
  conversationId,
  fileInputRef,
  disabled,
}: {
  conversationId: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  disabled: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.conversationFiles(conversationId);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiUpload<UploadedFile>(
        `/api/conversations/${conversationId}/files`,
        formData,
      );
    },
    onSuccess() {
      queryClient.invalidateQueries({ queryKey });
      toast.success('File attached');
    },
    onError(err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    },
  });

  const handleClick = useCallback(() => {
    if (!fileInputRef.current) return;
    // Wire up the hidden input's change event to our mutation
    const input = fileInputRef.current;
    const handler = () => {
      if (input.files) {
        for (const file of Array.from(input.files)) {
          uploadMutation.mutate(file);
        }
      }
      input.removeEventListener('change', handler);
    };
    input.addEventListener('change', handler);
    input.click();
  }, [fileInputRef, uploadMutation]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={handleClick}
      disabled={disabled || uploadMutation.isPending}
      aria-label="Attach file"
      className="text-muted-foreground hover:text-foreground"
    >
      <Paperclip className="size-4" />
    </Button>
  );
}

function FileChips({ conversationId }: { conversationId: string }) {
  const queryKey = queryKeys.conversationFiles(conversationId);

  const { data } = useQuery({
    queryKey,
    queryFn: () =>
      apiFetch<{ data: UploadedFile[] }>(
        `/api/conversations/${conversationId}/files`,
      ),
  });

  const files = data?.data ?? [];
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-1">
      {files.map((file) => (
        <Badge
          key={file.id}
          variant="secondary"
          className="gap-1 text-xs font-normal"
        >
          <Paperclip className="size-3" />
          {file.originalName}
        </Badge>
      ))}
    </div>
  );
}

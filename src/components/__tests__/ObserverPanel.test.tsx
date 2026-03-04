import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ChatMessage, StreamingStatus } from '@/hooks/useStreamingChat';

// Mock hooks that ObserverPanel uses internally
mock.module('@/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

mock.module('@/hooks/useAppConfig', () => ({
  useAppConfig: () => ({ maxMessageChars: 5000, minMessagesToComplete: 5 }),
}));

// Mock use-stick-to-bottom since it relies on browser layout APIs
const MockContent = ({
  children,
  ...props
}: { children?: React.ReactNode } & Record<string, unknown>) => (
  <div {...props}>{children}</div>
);

const MockStickToBottom = Object.assign(
  ({
    children,
    ...props
  }: { children?: React.ReactNode } & Record<string, unknown>) => (
    <div {...props}>{children}</div>
  ),
  { Content: MockContent },
);

mock.module('use-stick-to-bottom', () => ({
  StickToBottom: MockStickToBottom,
  useStickToBottomContext: () => ({
    isAtBottom: true,
    scrollToBottom: () => {},
  }),
}));

// Import component after mocks are set up
const { ObserverPanel } = await import('../ObserverPanel');

afterEach(cleanup);

const defaultProps = {
  messages: [] as ChatMessage[],
  status: 'idle' as StreamingStatus,
  error: null as string | null,
  initialized: true,
  onSend: mock(() => {}),
  onClose: mock(() => {}),
};

function renderPanel(overrides: Partial<typeof defaultProps> = {}) {
  return render(<ObserverPanel {...defaultProps} {...overrides} />);
}

describe('ObserverPanel', () => {
  test('renders aside element with correct aria-label', () => {
    renderPanel();
    const aside = screen.getByRole('complementary', {
      name: 'Observer panel',
    });
    expect(aside).toBeDefined();
  });

  test('shows empty state message when no messages', () => {
    renderPanel();
    expect(
      screen.getByText('The observer is watching your conversation.'),
    ).toBeDefined();
  });

  test('shows observer messages when provided', () => {
    const messages: ChatMessage[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: 'Good use of probing questions.',
        isStreaming: false,
      },
      {
        id: 'msg-2',
        role: 'user',
        content: 'How can I improve?',
        isStreaming: false,
      },
    ];
    renderPanel({ messages });
    expect(screen.getByText('Good use of probing questions.')).toBeDefined();
    expect(screen.getByText('How can I improve?')).toBeDefined();
  });

  test('calls onClose when close button is clicked', () => {
    const onClose = mock(() => {});
    renderPanel({ onClose });
    const closeButton = screen.getByLabelText('Close observer panel');
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('shows loading state when status is streaming', () => {
    renderPanel({ status: 'streaming' });
    expect(screen.getByText('Connecting to observer...')).toBeDefined();
  });

  test('hides empty state when streaming', () => {
    renderPanel({ status: 'streaming', messages: [] });
    expect(
      screen.queryByText('The observer is watching your conversation.'),
    ).toBeNull();
  });

  test('renders Observer heading in header', () => {
    renderPanel();
    expect(screen.getByText('Observer')).toBeDefined();
  });

  test('renders ask-the-observer input placeholder', () => {
    renderPanel();
    expect(screen.getByPlaceholderText('Ask the observer...')).toBeDefined();
  });
});

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ConversationHeaderActions } from '../conversation/ConversationHeaderActions';

afterEach(cleanup);

const defaults = {
  observerOpen: false,
  isStreaming: false,
  completing: false,
  canEnd: true,
  messagesRemaining: 0,
  onToggleObserver: mock(() => {}),
  onEndConversation: mock(() => {}),
  onRestart: mock(() => {}),
};

function renderActions(overrides: Partial<typeof defaults> = {}) {
  const props = { ...defaults, ...overrides };
  return render(
    <TooltipProvider>
      <ConversationHeaderActions {...props} />
    </TooltipProvider>,
  );
}

describe('ConversationHeaderActions', () => {
  test('renders Observer and End Conversation buttons', () => {
    renderActions();
    expect(screen.getByText('Observer')).toBeDefined();
    expect(screen.getByText('End Conversation')).toBeDefined();
  });

  test('calls onToggleObserver when Observer button is clicked', () => {
    const onToggleObserver = mock(() => {});
    renderActions({ onToggleObserver });
    fireEvent.click(screen.getByText('Observer'));
    expect(onToggleObserver).toHaveBeenCalledTimes(1);
  });

  test('disables End Conversation when canEnd is false', () => {
    renderActions({ canEnd: false, messagesRemaining: 3 });
    const button = screen.getByText('End Conversation').closest('button');
    expect(button?.disabled).toBe(true);
  });

  test('disables End Conversation when isStreaming', () => {
    renderActions({ isStreaming: true });
    const button = screen.getByText('End Conversation').closest('button');
    expect(button?.disabled).toBe(true);
  });

  test('disables End Conversation when completing', () => {
    renderActions({ completing: true });
    const button = screen.getByText('Completing...').closest('button');
    expect(button?.disabled).toBe(true);
  });

  test('shows "Completing..." text when completing', () => {
    renderActions({ completing: true });
    expect(screen.getByText('Completing...')).toBeDefined();
    expect(screen.queryByText('End Conversation')).toBeNull();
  });

  test('End Conversation button is enabled when canEnd and not streaming', () => {
    renderActions({ canEnd: true, isStreaming: false, completing: false });
    const button = screen.getByText('End Conversation').closest('button');
    expect(button?.disabled).toBe(false);
  });

  test('renders overflow menu button for restart', () => {
    renderActions({ isStreaming: false });
    expect(screen.getByText('More options')).toBeDefined();
  });

  test('overflow menu button is not disabled when not streaming', () => {
    renderActions({ isStreaming: false });
    const menuButton = screen.getByText('More options').closest('button');
    expect(menuButton).toBeDefined();
    expect(menuButton?.disabled).toBeFalsy();
  });
});

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StreamingStatusIndicator } from '../StreamingStatusIndicator';

afterEach(cleanup);

describe('StreamingStatusIndicator', () => {
  test('renders nothing when idle with no error', () => {
    const { container } = render(
      <StreamingStatusIndicator
        status="idle"
        loadingLabel="Loading..."
        error={null}
      />,
    );
    expect(container.textContent).toBe('');
  });

  test('shows loading label when streaming', () => {
    render(
      <StreamingStatusIndicator
        status="streaming"
        loadingLabel="Student is typing..."
        error={null}
      />,
    );
    expect(screen.getByText('Student is typing...')).toBeDefined();
  });

  test('hides loading label when not streaming', () => {
    render(
      <StreamingStatusIndicator
        status="idle"
        loadingLabel="Student is typing..."
        error={null}
      />,
    );
    expect(screen.queryByText('Student is typing...')).toBeNull();
  });

  test('shows error message when error is set', () => {
    render(
      <StreamingStatusIndicator
        status="idle"
        loadingLabel="Loading..."
        error="Something went wrong"
      />,
    );
    expect(screen.getByText('Something went wrong')).toBeDefined();
  });

  test('shows retry button when onRetry is provided', () => {
    const onRetry = mock(() => {});
    render(
      <StreamingStatusIndicator
        status="idle"
        loadingLabel="Loading..."
        error="Failed"
        onRetry={onRetry}
      />,
    );
    const retryButton = screen.getByText('Retry');
    expect(retryButton).toBeDefined();
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('shows dismiss button when onDismissError is provided', () => {
    const onDismiss = mock(() => {});
    render(
      <StreamingStatusIndicator
        status="idle"
        loadingLabel="Loading..."
        error="Failed"
        onDismissError={onDismiss}
      />,
    );
    const dismissButton = screen.getByText('Dismiss');
    expect(dismissButton).toBeDefined();
    fireEvent.click(dismissButton);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('does not show retry/dismiss buttons when callbacks are not provided', () => {
    render(
      <StreamingStatusIndicator
        status="idle"
        loadingLabel="Loading..."
        error="Failed"
      />,
    );
    expect(screen.queryByText('Retry')).toBeNull();
    expect(screen.queryByText('Dismiss')).toBeNull();
  });

  test('shows both streaming indicator and error simultaneously', () => {
    render(
      <StreamingStatusIndicator
        status="streaming"
        loadingLabel="Loading..."
        error="Previous error"
      />,
    );
    expect(screen.getByText('Loading...')).toBeDefined();
    expect(screen.getByText('Previous error')).toBeDefined();
  });
});

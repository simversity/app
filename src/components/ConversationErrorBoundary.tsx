import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

type Props = { children: ReactNode; onReset: () => void };
type State = { hasError: boolean };

export class ConversationErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error(
        'ConversationErrorBoundary caught:',
        error,
        info.componentStack,
      );
    }
  }
  override render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background p-8 text-center"
        >
          <p className="text-lg font-semibold">Something went wrong</p>
          <p className="text-sm text-muted-foreground">
            The conversation encountered an error.
          </p>
          <Button
            onClick={() => {
              this.setState({ hasError: false });
              this.props.onReset();
            }}
          >
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

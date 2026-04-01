import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { authClient, signOut, useSession } from '@/lib/auth-client';

export const Route = createFileRoute('/_auth/verify-email')({
  component: VerifyEmail,
});

function VerifyEmail() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);

  const email = session?.user?.email;

  const startCooldown = useCallback(() => {
    setCooldown(60);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleResend = async () => {
    if (!email || cooldown > 0) return;
    setError('');
    setResending(true);
    setResent(false);

    try {
      await authClient.sendVerificationEmail({
        email,
        callbackURL: '/dashboard',
      });
      setResent(true);
      startCooldown();
    } catch {
      setError('Unable to resend. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: '/login' });
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Check your email
          </h1>
          <p className="text-sm text-muted-foreground">
            We sent a verification link to{' '}
            <span className="font-medium text-foreground">
              {email || 'your email'}
            </span>
            . Click the link to verify your account.
          </p>
        </div>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {resent && (
          <Alert role="status">
            <AlertDescription>
              Verification email resent. Check your inbox.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <Button
            onClick={handleResend}
            disabled={resending || cooldown > 0}
            className="w-full"
          >
            {resending
              ? 'Resending...'
              : cooldown > 0
                ? `Resend in ${cooldown}s`
                : 'Resend verification email'}
          </Button>

          <Button variant="outline" onClick={handleSignOut} className="w-full">
            Back to sign in
          </Button>
        </div>

        <div className="space-y-2 text-center text-xs text-muted-foreground">
          <p>
            Check your spam or promotions folder if you don&apos;t see it in
            your inbox.
          </p>
          <p>
            Wrong email?{' '}
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline"
              onClick={async () => {
                await signOut();
                navigate({ to: '/register' });
              }}
            >
              Sign up again
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, apiMutate } from '@/lib/api';
import { authClient, signUp } from '@/lib/auth-client';
import { isAbortError } from '@/lib/error-utils';

export const Route = createFileRoute('/_auth/register')({
  component: Register,
});

function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showInviteField, setShowInviteField] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<{ inviteCodeEnabled: boolean }>('/api/config/registration', {
      signal: controller.signal,
    })
      .then((data) => {
        if (data.inviteCodeEnabled) setShowInviteField(true);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setShowInviteField(true);
      });
    return () => controller.abort();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);

    try {
      await signUp.email(
        {
          name,
          email,
          password,
        },
        {
          onSuccess: async () => {
            if (inviteCode.trim()) {
              try {
                await apiMutate('/api/claim-role', {
                  body: { inviteCode: inviteCode.trim() },
                });
                // Bust cookie cache so the updated role is picked up immediately
                await authClient.getSession({
                  query: { disableCookieCache: true },
                  fetchOptions: { throw: true },
                });
              } catch (claimErr) {
                const msg =
                  claimErr instanceof Error ? claimErr.message : 'invalid code';
                toast.warning(
                  `Account created, but invite code failed: ${msg}`,
                );
              }
            }
            // Always navigate — claim errors are non-blocking (account was created)
            navigate({ to: '/verify-email' });
          },
          onError: (ctx) => {
            setError(ctx.error.message || 'Registration failed');
          },
        },
      );
    } catch (err) {
      setError(
        err instanceof Error && err.message !== 'Failed to fetch'
          ? err.message
          : 'Unable to connect. Please check your network and try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Create account
          </h1>
          <p className="text-sm text-muted-foreground">
            Practice teaching with AI students who hold real misconceptions
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
          aria-describedby={error ? 'register-error' : undefined}
        >
          {error && (
            <Alert variant="destructive" id="register-error" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              required
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@university.edu"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              maxLength={128}
            />
          </div>

          {showInviteField && (
            <div className="space-y-2">
              <Label htmlFor="inviteCode">
                Invite code{' '}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Input
                id="inviteCode"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Enter code if you have one"
              />
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Creating account...' : 'Create account'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>

        <p className="text-center text-xs text-muted-foreground/60">
          By creating an account you agree to our{' '}
          <Link
            to="/terms"
            className="underline underline-offset-4 hover:text-muted-foreground"
          >
            Terms
          </Link>{' '}
          and{' '}
          <Link
            to="/privacy"
            className="underline underline-offset-4 hover:text-muted-foreground"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

import { createFileRoute, Link } from '@tanstack/react-router';
import { usePageTitle } from '@/hooks/usePageTitle';

export const Route = createFileRoute('/privacy')({
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  usePageTitle('Privacy Policy');

  return (
    <div className="min-h-dvh bg-background">
      <nav className="flex items-center justify-between px-6 py-5 sm:px-10">
        <Link
          to="/"
          className="flex items-center gap-2.5 text-xl font-semibold tracking-tight"
          style={{ fontFamily: 'Fraunces, serif' }}
        >
          <img
            src="/favicon.png"
            alt="Simversity"
            className="h-8 w-auto"
            width={32}
            height={32}
          />
          Simversity
        </Link>
      </nav>

      <main className="mx-auto max-w-3xl px-6 py-12 sm:px-10">
        <h1
          className="text-3xl font-light tracking-tight sm:text-4xl"
          style={{ fontFamily: 'Fraunces, serif' }}
        >
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: March 1, 2026
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="text-lg font-semibold">1. What We Collect</h2>
            <p className="mt-2">
              When you use Simversity, we collect the following information:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                <strong>Account information:</strong> name, email address, and
                password (stored as a secure hash).
              </li>
              <li>
                <strong>Profile information:</strong> grade level, subjects
                taught, and years of teaching experience (optional).
              </li>
              <li>
                <strong>Conversation data:</strong> messages you exchange with
                AI student personas and observer feedback generated during
                practice sessions.
              </li>
              <li>
                <strong>Usage data:</strong> conversation counts, progress
                tracking, and session metadata (IP address, browser type).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              2. How We Use Your Information
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                To provide and improve the teaching simulation experience.
              </li>
              <li>
                To generate AI-powered observer feedback on your teaching
                practice.
              </li>
              <li>To track your progress across scenarios and courses.</li>
              <li>
                To authenticate your account and maintain session security.
              </li>
              <li>
                To send transactional emails (verification, password reset).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. AI Processing</h2>
            <p className="mt-2">
              Your conversation messages are sent to third-party AI providers
              (currently NEAR AI Cloud) to generate student and observer
              responses. These providers process your messages to produce
              responses but do not retain your data for their own training
              purposes. We do not send your account information (name, email) to
              AI providers — only the conversation content necessary to generate
              responses.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Cookies</h2>
            <p className="mt-2">
              We use essential cookies to maintain your authenticated session.
              These cookies are necessary for the application to function and
              cannot be disabled. We do not use advertising or analytics
              cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              5. Data Storage & Security
            </h2>
            <p className="mt-2">
              Your data is stored in a database hosted on our infrastructure.
              Passwords are hashed using industry-standard algorithms. Sessions
              expire after 7 days of inactivity. We use HTTPS encryption for all
              data in transit.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Your Rights</h2>
            <p className="mt-2">You have the right to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                <strong>Access</strong> the personal data we hold about you.
              </li>
              <li>
                <strong>Correct</strong> inaccurate information via your profile
                settings.
              </li>
              <li>
                <strong>Delete</strong> your account and associated data by
                contacting us.
              </li>
              <li>
                <strong>Export</strong> your conversation history upon request.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Data Retention</h2>
            <p className="mt-2">
              We retain your account and conversation data for as long as your
              account is active. If you request account deletion, we will remove
              your personal data within 30 days. Anonymized, aggregated usage
              statistics may be retained for product improvement.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Third-Party Services</h2>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                <strong>NEAR AI Cloud:</strong> processes conversation messages
                to generate AI responses.
              </li>
              <li>
                <strong>Resend:</strong> delivers transactional emails
                (verification, password reset).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. Children</h2>
            <p className="mt-2">
              Simversity is designed for use by educators and is not directed at
              children under 13. We do not knowingly collect personal
              information from children.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">10. Changes</h2>
            <p className="mt-2">
              We may update this policy from time to time. We will notify
              registered users of material changes via email. Continued use of
              the service after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">11. Contact</h2>
            <p className="mt-2">
              For privacy-related questions or data requests, contact us at{' '}
              <a
                href="mailto:support@simversity.app"
                className="text-primary underline-offset-4 hover:underline"
              >
                support@simversity.app
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
          <Link to="/terms" className="hover:text-primary hover:underline">
            Terms of Service
          </Link>
        </div>
      </main>
    </div>
  );
}

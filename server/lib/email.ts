import { Resend } from 'resend';
import { env } from './env';
import { log } from './logger';

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(env.RESEND_API_KEY);
  }
  return resendClient;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
}) {
  if (!env.RESEND_API_KEY) {
    log.info(
      { event: 'email_skipped', to: opts.to, subject: opts.subject },
      'Email skipped (no RESEND_API_KEY)',
    );
    return;
  }

  const resend = getResendClient();
  // EMAIL_FROM is guaranteed by env validation when RESEND_API_KEY is set
  const from = env.EMAIL_FROM as string;
  const { error } = await resend.emails.send({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

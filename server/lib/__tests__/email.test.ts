import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';

// Mock the 'resend' package — only email.ts imports it, safe to mock globally
const sendSpy = mock(() =>
  Promise.resolve({ error: null as { message: string } | null }),
);
mock.module('resend', () => ({
  Resend: class {
    emails = { send: sendSpy };
  },
}));

import { sendEmail } from '../email';
import { env } from '../env';
import { log } from '../logger';

// spyOn without mockImplementation — calls through to real log.info
const infoSpy = spyOn(log, 'info');

describe('sendEmail', () => {
  const origKey = env.RESEND_API_KEY;
  const origFrom = env.EMAIL_FROM;

  afterEach(() => {
    infoSpy.mockClear();
    sendSpy.mockClear();
    Object.assign(env, { RESEND_API_KEY: origKey, EMAIL_FROM: origFrom });
  });

  test('skips sending when RESEND_API_KEY is not set', async () => {
    Object.assign(env, { RESEND_API_KEY: undefined });
    await sendEmail({ to: 'a@b.com', subject: 'Hi', text: 'Hello' });
    expect(infoSpy).toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  test('calls Resend SDK when key is set', async () => {
    Object.assign(env, {
      RESEND_API_KEY: 'test-key',
      EMAIL_FROM: 'noreply@test.com',
    });
    await sendEmail({ to: 'user@test.com', subject: 'Test', text: 'Body' });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith({
      from: 'noreply@test.com',
      to: 'user@test.com',
      subject: 'Test',
      text: 'Body',
    });
  });

  test('throws on Resend error response', async () => {
    Object.assign(env, {
      RESEND_API_KEY: 'test-key',
      EMAIL_FROM: 'noreply@test.com',
    });
    sendSpy.mockImplementationOnce(() =>
      Promise.resolve({ error: { message: 'Rate limited' } }),
    );
    expect(
      sendEmail({ to: 'user@test.com', subject: 'Test', text: 'Body' }),
    ).rejects.toThrow('Failed to send email: Rate limited');
  });
});

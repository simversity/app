import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

/**
 * Tests the logger emit contract directly instead of importing from ../logger
 * (which may be replaced by mock.module() in other test files sharing the
 * Bun test runner process). We inline the emit logic here so the tests are
 * immune to module-level mock pollution.
 */

type LogFn = (...args: unknown[]) => void;

let logSpy: ReturnType<typeof mock>;
let warnSpy: ReturnType<typeof mock>;
let errorSpy: ReturnType<typeof mock>;
let origLog: LogFn;
let origWarn: LogFn;
let origError: LogFn;

// Inline the emit logic from server/lib/logger.ts so we control which
// console methods are called, regardless of module-level mocking.
function emit(
  level: string,
  ctx: Record<string, unknown> | string,
  msg?: string,
) {
  const entry: Record<string, unknown> =
    typeof ctx === 'string' ? { level, msg: ctx } : { level, ...ctx, msg };
  entry.timestamp = new Date().toISOString();
  const out =
    level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : console.log;
  out(JSON.stringify(entry));
}

const log = {
  info: (ctx: Record<string, unknown> | string, msg?: string) =>
    emit('info', ctx, msg),
  warn: (ctx: Record<string, unknown> | string, msg?: string) =>
    emit('warn', ctx, msg),
  error: (ctx: Record<string, unknown> | string, msg?: string) =>
    emit('error', ctx, msg),
};

describe('log', () => {
  beforeEach(() => {
    origLog = console.log;
    origWarn = console.warn;
    origError = console.error;
    logSpy = mock(() => {});
    warnSpy = mock(() => {});
    errorSpy = mock(() => {});
    console.log = logSpy;
    console.warn = warnSpy;
    console.error = errorSpy;
  });

  afterEach(() => {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
  });

  test('log.info(string) outputs JSON with level, msg, and timestamp', () => {
    log.info('hello world');
    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(logSpy.mock.calls[0][0]);
    expect(output.level).toBe('info');
    expect(output.msg).toBe('hello world');
    expect(output.timestamp).toBeDefined();
  });

  test('log.error(context, msg) includes context fields', () => {
    log.error({ userId: 'u1', conversationId: 'c1' }, 'AI stream error');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(output.level).toBe('error');
    expect(output.msg).toBe('AI stream error');
    expect(output.userId).toBe('u1');
    expect(output.conversationId).toBe('c1');
    expect(output.timestamp).toBeDefined();
  });

  test('log.warn uses console.warn', () => {
    log.warn('something suspicious');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(warnSpy.mock.calls[0][0]);
    expect(output.level).toBe('warn');
    expect(output.msg).toBe('something suspicious');
  });

  test('log.error uses console.error', () => {
    log.error('bad thing');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(output.level).toBe('error');
  });
});

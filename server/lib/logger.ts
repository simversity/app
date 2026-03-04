type LogContext = Record<string, unknown>;

function emit(level: string, ctx: LogContext | string, msg?: string) {
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

export const log = {
  info: (ctx: LogContext | string, msg?: string) => emit('info', ctx, msg),
  warn: (ctx: LogContext | string, msg?: string) => emit('warn', ctx, msg),
  error: (ctx: LogContext | string, msg?: string) => emit('error', ctx, msg),
  debug: (ctx: LogContext | string, msg?: string) => {
    if (process.env.NODE_ENV !== 'production') emit('debug', ctx, msg);
  },
};

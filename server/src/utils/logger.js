const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

// Keys whose values must never reach the logs (Sections 24, 68).
const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|cookie|api[-_]?key|otp|nin/i;

export function redact(value, depth = 0) {
  if (value === null || typeof value !== 'object') return value;
  if (depth > 5) return '[Truncated]';
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? '[Redacted]' : redact(v, depth + 1);
  }
  return out;
}

export function createLogger({ level = 'info', json = false } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  function write(lvl, message, meta) {
    if (LEVELS[lvl] < threshold) return;
    const entry = { time: new Date().toISOString(), level: lvl, message, ...(meta ? redact(meta) : {}) };
    const stream = LEVELS[lvl] >= LEVELS.warn ? process.stderr : process.stdout;
    if (json) {
      stream.write(`${JSON.stringify(entry)}\n`);
    } else {
      const extra = meta ? ` ${JSON.stringify(redact(meta))}` : '';
      stream.write(`[${entry.time}] ${lvl.toUpperCase()} ${message}${extra}\n`);
    }
  }

  return {
    debug: (msg, meta) => write('debug', msg, meta),
    info: (msg, meta) => write('info', msg, meta),
    warn: (msg, meta) => write('warn', msg, meta),
    error: (msg, meta) => write('error', msg, meta),
  };
}

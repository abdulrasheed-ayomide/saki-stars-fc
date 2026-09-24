import mongoose from 'mongoose';

// Query-selector injection such as { "email": { "$gt": "" } } is blocked before it reaches
// a query: every input is typed by zod (validate.js) and rejectOperatorKeys() refuses any
// request data containing "$" keys. Mongoose's global sanitizeFilter is not used because it
// also neutralises the server's own operators ($in, $gte, ...).
mongoose.set('strictQuery', true);
// Fail fast instead of queueing queries for 10 seconds while the database is unreachable.
mongoose.set('bufferCommands', false);

const STATES = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

let transactionsSupported = false;

export function getDatabaseState() {
  return STATES[mongoose.connection.readyState] ?? 'unknown';
}

export function isDatabaseReady() {
  return mongoose.connection.readyState === 1;
}

/** Atlas clusters are replica sets and support transactions; a bare local mongod does not. */
export function supportsTransactions() {
  return transactionsSupported;
}

async function detectTransactions() {
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    transactionsSupported = Boolean(hello.setName || hello.msg === 'isdbgrid');
  } catch {
    transactionsSupported = false;
  }
}

/** Explains the most common Atlas connection problems in plain words. */
export function explainConnectionError(err) {
  const msg = err?.message || '';
  if (/EBADNAME|ENOTFOUND|querySrv/i.test(msg)) {
    return 'The cluster address in MONGODB_URI could not be found. Copy the connection string again from Atlas (Database > Connect > Drivers).';
  }
  if (/auth|Authentication failed|bad auth/i.test(msg)) {
    return 'MongoDB rejected the username or password in MONGODB_URI. Check the database user in Atlas (Database Access). Passwords with special characters must be URL-encoded.';
  }
  if (/whitelist|IP|Server selection timed out|ETIMEDOUT|ECONNREFUSED/i.test(msg)) {
    return 'The database did not answer. In Atlas, open Network Access and allow your current IP address (or 0.0.0.0/0 for development).';
  }
  return msg;
}

// Errors that will not fix themselves by retrying.
function isPermanent(err) {
  return /EBADNAME|bad auth|Authentication failed|Invalid scheme|URI/i.test(err?.message || '');
}

/**
 * Connects to MongoDB, retrying with backoff. The HTTP server is already listening while
 * this runs, so health checks answer (with "not ready") during the first connection.
 */
export async function connectDatabase({ uri, logger, maxAttempts = 10 }) {
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await mongoose.connect(uri, {
        // Create missing indexes on start (a no-op when they exist). Unique and expiry indexes
        // protect data, so they must never depend on someone remembering a manual step.
        // `npm run db:indexes` additionally removes obsolete indexes and applies data repairs.
        autoIndex: true,
        serverSelectionTimeoutMS: 10_000,
      });
      await detectTransactions();
      logger.info('MongoDB connected', { transactions: transactionsSupported });
      return mongoose.connection;
    } catch (err) {
      const reason = explainConnectionError(err);
      logger.error('MongoDB connection failed', { attempt, maxAttempts, reason });
      if (attempt === maxAttempts || isPermanent(err)) {
        const final = new Error(reason);
        final.cause = err;
        throw final;
      }
      const delay = Math.min(30_000, 1000 * 2 ** (attempt - 1));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return null;
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

/**
 * Runs `fn(session)` inside a transaction when the database supports it, so multi-document
 * changes (approvals, results) either fully succeed or fully fail. On a standalone
 * development database it runs without a transaction; `session` is then undefined.
 */
export async function withTransaction(fn) {
  if (!transactionsSupported) return fn(undefined);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

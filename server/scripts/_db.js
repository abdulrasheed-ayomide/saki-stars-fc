import mongoose from 'mongoose';
import { explainConnectionError } from '../src/db/connection.js';

/** Connects scripts to the database named in MONGODB_URI (from .env or the environment). */
export async function connectForScript() {
  const uri = (process.env.MONGODB_URI || '').trim();
  if (!uri || /[<>]/.test(uri)) {
    console.error('MONGODB_URI is not set (or still has placeholder text). Put it in server/.env or set it in the environment.');
    process.exit(1);
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000, autoIndex: false });
  } catch (err) {
    console.error(`Could not connect to MongoDB: ${explainConnectionError(err)}`);
    process.exit(1);
  }
  return mongoose.connection;
}

export async function ask(question, { hidden = false } = {}) {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    rl._writeToOutput = (s) => {
      if (s.includes(question)) rl.output.write(s);
      else rl.output.write('*');
    };
  }
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  if (hidden) process.stdout.write('\n');
  return answer.trim();
}

/**
 * Restores a backup made with backup:export.
 *
 * Safety: by default it only restores into an EMPTY database, so run restore tests against a
 * separate test database (set MONGODB_URI to it). To overwrite a non-empty database you must
 * pass --replace and type the database name to confirm.
 *
 *   MONGODB_URI=<test-db-uri> npm run backup:restore -- backups/sakistarsfc-2026-09-23T10-00.json.gz
 */
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { connectForScript, ask } from './_db.js';

const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!file) {
  console.error('Give the backup file: npm run backup:restore -- path/to/backup.json.gz');
  process.exit(1);
}
const raw = await readFile(file);
const json = JSON.parse((file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8'));
if (json.format !== 'sakistarsfc-backup') {
  console.error('This is not a SakiStarsFC backup file.');
  process.exit(1);
}

const conn = await connectForScript();
const existing = (await conn.db.listCollections().toArray()).filter((c) => !c.name.startsWith('system.'));
let nonEmpty = false;
for (const c of existing) if ((await conn.db.collection(c.name).estimatedDocumentCount()) > 0) nonEmpty = true;

if (nonEmpty) {
  if (!process.argv.includes('--replace')) {
    console.error(`Database "${conn.name}" is not empty. Restore into an empty database, or pass --replace to overwrite it.`);
    process.exit(1);
  }
  const typed = await ask(`This will DELETE the current data in "${conn.name}". Type the database name to continue: `);
  if (typed !== conn.name) {
    console.error('Cancelled.');
    process.exit(1);
  }
}

for (const [name, docs] of Object.entries(json.collections)) {
  const collection = conn.db.collection(name);
  if (nonEmpty) await collection.deleteMany({});
  const parsed = docs.map((d) => EJSON.deserialize(d, { relaxed: false }));
  for (let i = 0; i < parsed.length; i += 500) {
    if (parsed.length) await collection.insertMany(parsed.slice(i, i + 500), { ordered: false });
  }
  console.log(`  ${name}: ${parsed.length}`);
}
console.log(`Restored backup from ${json.createdAt}. Run "npm run db:indexes" next.`);
await mongoose.disconnect();

/**
 * Independent backup: writes every collection to a single JSON file (MongoDB Extended JSON,
 * so dates and IDs are kept exactly). Keep these files somewhere other than Atlas.
 *
 *   npm run backup:export                  -> backups/sakistarsfc-YYYY-MM-DDTHH-MM.json.gz
 *   npm run backup:export -- --out file.json.gz
 *
 * Media files stay in Cloudinary; the backup keeps their public IDs and URLs.
 * See docs/OPERATIONS.md for the restore procedure and regular restore tests.
 */
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { connectForScript } from './_db.js';

const outIndex = process.argv.indexOf('--out');
const stamp = new Date().toISOString().slice(0, 16).replace(/:/g, '-');
const out = outIndex > -1 ? process.argv[outIndex + 1] : path.join('backups', `sakistarsfc-${stamp}.json.gz`);

const conn = await connectForScript();
await mkdir(path.dirname(out), { recursive: true });
const collections = (await conn.db.listCollections().toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.')).sort();

async function* generate() {
  yield `{"format":"sakistarsfc-backup","version":1,"createdAt":"${new Date().toISOString()}","database":${JSON.stringify(conn.name)},"collections":{`;
  let firstCollection = true;
  for (const name of collections) {
    yield `${firstCollection ? '' : ','}${JSON.stringify(name)}:[`;
    firstCollection = false;
    let first = true;
    let count = 0;
    for await (const doc of conn.db.collection(name).find()) {
      yield `${first ? '' : ','}${EJSON.stringify(doc, { relaxed: false })}`;
      first = false;
      count += 1;
    }
    yield ']';
    console.log(`  ${name}: ${count}`);
  }
  yield '}}';
}

await pipeline(Readable.from(generate()), createGzip(), createWriteStream(out));
console.log(`Backup written to ${out}`);
await mongoose.disconnect();

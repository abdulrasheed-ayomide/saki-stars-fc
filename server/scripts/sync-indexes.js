/**
 * Makes the database indexes match the code exactly (the API creates missing indexes when it
 * starts; this also removes indexes the code no longer uses). Run after each deploy:
 *   npm run db:indexes
 * It also repairs data that later versions expect (currently: player URLs for players whose
 * surname is hidden must not contain the surname; renamed video categories). Safe to run any number of times.
 */
import mongoose from 'mongoose';
import { connectForScript } from './_db.js';
import * as models from '../src/models/index.js';
import { publicSlugBase } from '../src/models/Player.js';
import { slugify } from '../src/utils/text.js';

await connectForScript();
for (const [name, model] of Object.entries(models)) {
  if (!model?.syncIndexes) continue;
  try {
    await model.syncIndexes();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✘ ${name}: ${err.message}`);
  }
}

let fixed = 0;
for await (const player of models.Player.find({ hideFullNamePublicly: true })) {
  const root = slugify(publicSlugBase(player));
  if (player.slug !== root && !player.slug.startsWith(`${root}-`)) {
    player.slug = undefined; // the model assigns a new privacy-safe slug on save
    await player.save();
    fixed += 1;
  }
}
if (fixed) console.log(`✔ updated ${fixed} player URL(s) that contained a hidden surname`);

const renamed = await models.migrateLegacyVideoCategories();
if (renamed) console.log(`✔ renamed the category of ${renamed} video(s) (e.g. Youth → Nigeria Youth League (NYL))`);
await mongoose.disconnect();

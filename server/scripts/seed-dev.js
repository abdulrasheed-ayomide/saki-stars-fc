/**
 * DEVELOPMENT DEMO DATA. NEVER RUN AGAINST THE LIVE CLUB DATABASE.
 *
 * Fills an empty development database with clearly-labelled demo teams, players, fixtures,
 * results and news so the website can be tried out locally. Everything created is recorded
 * in a "_devseed" collection so it can be removed exactly:
 *
 *   npm run seed:dev              add demo data (refuses when NODE_ENV=production)
 *   npm run seed:dev -- --remove  delete everything the seed created
 *
 * Demo records are marked "(Demo)" / "Demo" so they are never mistaken for real club data.
 */
import mongoose from 'mongoose';
import { connectForScript } from './_db.js';
import { Season, Team, Competition, Match, Player, News, User, Video, Staff } from '../src/models/index.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run: NODE_ENV is production. Demo data must never reach the live site.');
  process.exit(1);
}

const conn = await connectForScript();
const registry = conn.db.collection('_devseed');

async function track(model, docs) {
  const list = Array.isArray(docs) ? docs : [docs];
  await registry.insertMany(list.map((d) => ({ model: model.modelName, id: d._id })));
  return docs;
}

if (process.argv.includes('--remove')) {
  const entries = await registry.find().toArray();
  const byModel = {};
  for (const e of entries) (byModel[e.model] ||= []).push(e.id);
  for (const [name, ids] of Object.entries(byModel)) {
    const res = await mongoose.model(name).deleteMany({ _id: { $in: ids } });
    console.log(`  removed ${res.deletedCount} ${name}`);
  }
  await registry.drop().catch(() => {});
  console.log('Demo data removed.');
  await mongoose.disconnect();
  process.exit(0);
}

if ((await registry.countDocuments()) > 0) {
  console.error('Demo data is already present. Run with --remove first to reset it.');
  process.exit(1);
}

const director = await User.findOne({ role: 'staff' }).lean();
const author = director ?? (await User.findOne().lean());
if (!author) {
  console.error('Create the first Director first (npm run director:create), then run the seed.');
  process.exit(1);
}

const now = Date.now();
const day = 86400000;
const year = new Date().getUTCFullYear();

const [season] = await track(Season, await Season.create([{ name: `Demo ${year}/${String(year + 1).slice(2)}`, startDate: new Date(now - 60 * day), endDate: new Date(now + 240 * day), isCurrent: !(await Season.exists({ isCurrent: true })) }]));

const teams = await track(
  Team,
  await Team.create([
    { name: 'First Team (Demo)', shortName: 'Stars', slug: 'demo-first-team', isClubTeam: true, category: 'Senior', ageGroup: 'Open', homeVenue: 'Demo Township Stadium', description: 'Demo senior squad used for local testing.', displayOrder: 1, season: season._id },
    { name: 'NEXT GEN (Demo)', shortName: 'Next Gen', slug: 'demo-next-gen', isClubTeam: true, category: 'Youth', ageGroup: 'U17', containsMinors: true, description: 'Demo youth squad used for local testing.', displayOrder: 2, season: season._id },
    { name: 'Demo Rovers', slug: 'demo-rovers' },
    { name: 'Demo Athletic', slug: 'demo-athletic' },
    { name: 'Demo City', slug: 'demo-city' },
    { name: 'Demo Wanderers', slug: 'demo-wanderers' },
  ]),
);
const [first, nextGen, rovers, athletic, city, wanderers] = teams;

const [league] = await track(
  Competition,
  await Competition.create([
    { name: 'Demo League One', shortName: 'DL1', slug: 'demo-league-one', type: 'league', organizer: 'Demo Football Association', description: 'Demo competition for local testing.', seasons: [season._id], currentSeason: season._id, teams: [first._id, rovers._id, athletic._id, city._id, wanderers._id] },
  ]),
);
await Team.updateMany({ _id: { $in: [first._id, rovers._id, athletic._id, city._id, wanderers._id] } }, { $addToSet: { competitions: league._id } });

const names = [
  ['Demo', 'Goalkeeper', 'Goalkeeper', 1], ['Demo', 'Right-Back', 'Defender', 2], ['Demo', 'Centre-Back', 'Defender', 4], ['Demo', 'Sweeper', 'Defender', 5],
  ['Demo', 'Left-Back', 'Defender', 3], ['Demo', 'Anchor', 'Midfielder', 6], ['Demo', 'Playmaker', 'Midfielder', 8], ['Demo', 'Winger', 'Forward', 7],
  ['Demo', 'Striker', 'Forward', 9], ['Demo', 'Number Ten', 'Midfielder', 10], ['Demo', 'Flyer', 'Forward', 11],
];
const players = await track(
  Player,
  await Player.create(
    names.map(([firstName, lastName, position, jerseyNumber], i) => ({
      firstName,
      lastName,
      position,
      jerseyNumber,
      team: first._id,
      nationality: 'Nigeria',
      bio: 'Demo player profile for local testing.',
      featured: i === 8 || i === 9,
    })),
  ),
);
await track(Player, await Player.create([{ firstName: 'Demo', lastName: 'Youngster', position: 'Midfielder', jerseyNumber: 16, team: nextGen._id, isMinor: true, hideFullNamePublicly: true }]));

const byNum = Object.fromEntries(players.map((p) => [p.jerseyNumber, p]));
const lineup = players.map((p) => ({ player: p._id, starter: true, minutes: 90 }));
const fixtures = [
  { h: first, a: rovers, d: -21, s: [2, 1], ev: [['goal', 23, 'home', 9, 10], ['goal', 51, 'away'], ['goal', 78, 'home', 11, 7]] },
  { h: athletic, a: first, d: -14, s: [0, 0], ev: [['yellow_card', 60, 'away', 6]] },
  { h: first, a: city, d: -7, s: [3, 0], ev: [['goal', 12, 'home', 9], ['penalty_goal', 44, 'home', 10], ['goal', 88, 'home', 7, 8]] },
  { h: wanderers, a: first, d: -3, s: [2, 1], ev: [['goal', 30, 'home'], ['goal', 55, 'away', 9, 11], ['goal', 90, 'home']] },
  { h: rovers, a: athletic, d: -10, s: [1, 1], ev: [] },
  { h: city, a: wanderers, d: -5, s: [0, 2], ev: [] },
  { h: first, a: athletic, d: 4, s: null, ev: [] },
  { h: city, a: first, d: 11, s: null, ev: [] },
  { h: first, a: wanderers, d: 18, s: null, ev: [] },
];
const matches = await track(
  Match,
  await Match.create(
    fixtures.map((f) => {
      const played = Boolean(f.s);
      const clubSide = f.h === first ? 'home' : f.a === first ? 'away' : null;
      return {
        competition: league._id,
        season: season._id,
        homeTeam: f.h._id,
        awayTeam: f.a._id,
        kickoffAt: new Date(now + f.d * day + 16 * 3600000),
        venue: f.h.homeVenue || `${f.h.name} Ground`,
        status: played ? 'completed' : 'scheduled',
        score: played ? { home: f.s[0], away: f.s[1] } : {},
        events: f.ev.map(([type, minute, side, num, assistNum]) => ({
          type,
          minute,
          side,
          player: num && side === clubSide ? byNum[num]._id : null,
          playerName: num && side === clubSide ? '' : 'Opponent player',
          assist: assistNum && side === clubSide ? byNum[assistNum]._id : null,
        })),
        lineups: played && clubSide ? { [clubSide]: lineup } : {},
        stats: played && clubSide ? { possession: { home: 52, away: 48 }, shots: { home: 11, away: 8 }, corners: { home: 5, away: 3 } } : {},
        report: played && clubSide ? { title: 'Demo match report', body: 'This is a demo match report for local testing.', publishedAt: new Date(now + f.d * day + 20 * 3600000) } : {},
        resultRecordedAt: played ? new Date() : null,
      };
    }),
  ),
);

await track(
  News,
  await News.create([
    { title: 'Demo: Stars win the opening home match', slug: 'demo-stars-win-opening-home-match', category: 'Match Report', content: '## Demo article\n\nThis is **demo news** for local testing.\n\n- It shows headings\n- It shows lists\n\nDelete it with `npm run seed:dev -- --remove`.', author: author._id, authorName: 'Demo Writer', status: 'published', publishedAt: new Date(now - 20 * day), competition: league._id, team: first._id, relatedMatches: [matches[0]._id] },
    { title: 'Demo: NEXT GEN trials announced', slug: 'demo-next-gen-trials-announced', category: 'Youth', content: 'Demo announcement about youth trials. This text exists only for local testing.', author: author._id, authorName: 'Demo Writer', status: 'published', publishedAt: new Date(now - 2 * day), team: nextGen._id },
    { title: 'Demo: draft article awaiting review', slug: 'demo-draft-article', category: 'Club News', content: 'Demo draft for trying the review workflow in the dashboard.', author: author._id, authorName: 'Demo Writer', status: 'review', submittedAt: new Date() },
  ]),
);

await track(Video, await Video.create([{ title: 'Demo video (YouTube)', category: 'Club TV', source: 'youtube', youtubeId: 'aqz-KE-bpKQ', status: 'published', publishedAt: new Date(now - day), description: 'Demo video for local testing (Big Buck Bunny, CC-BY Blender Foundation).' }]));
await track(Staff, await Staff.create([{ fullName: 'Demo Head Coach', staffRole: 'other', title: 'Head Coach', category: 'coaching', team: first._id, showOnWebsite: true, bio: 'Demo coaching profile for local testing.' }]));

console.log(`Demo data created: ${teams.length} teams, ${players.length + 1} players, ${matches.length} matches, 3 news articles.`);
console.log('Remove it with: npm run seed:dev -- --remove');
await mongoose.disconnect();

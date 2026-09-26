import { Router } from 'express';
import { publicPlayerFilter } from '../players/players.routes.js';
import { z } from 'zod';
import { Player, Team, News, Competition, Match, Video, User } from '../../models/index.js';
import { validate } from '../../middleware/validate.js';
import { containsRegex } from '../../utils/text.js';
import { publicPlayer, publicTeam, newsSummary, competitionSummary, matchSummary, publicVideo, staffPlayer, adminUser } from '../../serializers/index.js';
import { playerScopeFilter, scopeOf, has } from '../../auth/access.js';
import { MATCH_POPULATE } from '../football/teams.routes.js';

const querySchema = z.object({ q: z.string().trim().min(2, 'Type at least 2 characters.').max(100) });

/**
 * Public search only looks at public records and returns public serializers, so
 * private player data can never appear, even when the search term matches it.
 */
export function createSearchRouters({ auth, limiters }) {
  const pub = Router();
  const admin = Router();

  pub.get('/', limiters.search, validate({ query: querySchema }), async (req, res) => {
    const rx = containsRegex(req.valid.query.q);
    const teamIdsMatching = (await Team.find({ name: rx }).select('_id').lean()).map((t) => t._id);
    const [players, teams, news, competitions, matches, videos] = await Promise.all([
      Player.find({
        $and: [...(await publicPlayerFilter()).$and, { $or: [{ firstName: rx }, { knownAs: rx }, { lastName: rx, hideFullNamePublicly: { $ne: true } }] }],
      })
        .limit(8)
        .populate('team', 'name shortName slug logo isClubTeam')
        .lean(),
      Team.find({ status: 'active', isClubTeam: true, name: rx }).limit(5).lean(),
      News.find({ status: 'published', deletedAt: null, publishedAt: { $lte: new Date() }, $or: [{ title: rx }, { excerpt: rx }] })
        .sort({ publishedAt: -1 })
        .limit(8)
        .populate('author', 'name')
        .lean(),
      Competition.find({ status: 'active', $or: [{ name: rx }, { shortName: rx }] }).limit(5).lean(),
      teamIdsMatching.length
        ? Match.find({ deletedAt: null, $or: [{ homeTeam: { $in: teamIdsMatching } }, { awayTeam: { $in: teamIdsMatching } }] })
            .sort({ kickoffAt: -1 })
            .limit(8)
            .populate(MATCH_POPULATE)
            .lean()
        : [],
      Video.find({ status: 'published', deletedAt: null, title: rx }).sort({ publishedAt: -1 }).limit(6).lean(),
    ]);
    res.json({
      data: {
        players: players.map((p) => publicPlayer(p)),
        teams: teams.map(publicTeam),
        news: news.map(newsSummary),
        competitions: competitions.map(competitionSummary),
        matches: matches.map(matchSummary),
        videos: videos.map(publicVideo),
      },
    });
  });

  // Staff search respects each person's permissions and scope.
  admin.get('/', auth.requireAuth, auth.requireStaff, limiters.search, validate({ query: querySchema }), async (req, res) => {
    const rx = containsRegex(req.valid.query.q);
    const out = {};
    const viewPerm = scopeOf(req.auth, 'players.view') ? 'players.view' : scopeOf(req.auth, 'players.edit') ? 'players.edit' : null;
    if (viewPerm) {
      const players = await Player.find({ deletedAt: null, ...playerScopeFilter(req.auth, viewPerm), $or: [{ firstName: rx }, { lastName: rx }, { knownAs: rx }] })
        .limit(10)
        .populate('team', 'name shortName slug logo isClubTeam')
        .lean();
      out.players = players.map((p) => staffPlayer(p));
    }
    if (has(req.auth, 'users.view') || has(req.auth, 'users.manage')) {
      const users = await User.find({ deletedAt: null, $or: [{ name: rx }, { email: rx }] }).limit(10).lean();
      out.users = users.map(adminUser);
    }
    if (has(req.auth, 'news.create') || has(req.auth, 'news.edit') || has(req.auth, 'news.publish')) {
      const filter = { deletedAt: null, title: rx };
      if (!has(req.auth, 'news.edit') && !has(req.auth, 'news.publish')) filter.author = req.auth.user._id;
      const news = await News.find(filter).limit(10).populate('author', 'name').lean();
      out.news = news.map((n) => ({ ...newsSummary(n), status: n.status }));
    }
    out.teams = (await Team.find({ name: rx }).limit(10).lean()).map(publicTeam);
    res.json({ data: out });
  });

  return { pub, admin };
}

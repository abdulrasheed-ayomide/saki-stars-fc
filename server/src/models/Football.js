import mongoose from 'mongoose';
import { mediaSchema } from './_shared.js';

const { Schema } = mongoose;

// ---------------------------------------------------------------------------- Season
const seasonSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 }, // e.g. 2026/27
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isCurrent: { type: Boolean, default: false },
    status: { type: String, enum: ['upcoming', 'active', 'completed', 'archived'], default: 'active' },
  },
  { timestamps: true },
);
seasonSchema.index({ name: 1 }, { unique: true });
seasonSchema.index({ isCurrent: 1 });

// ---------------------------------------------------------------------------- Team
/**
 * Both the club's own teams (isClubTeam: true, e.g. First Team, Youth) and the opponents
 * they play. Opponents are needed so fixtures and full league tables can be recorded.
 */
const teamSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    shortName: { type: String, trim: true, maxlength: 30, default: '' },
    slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 120 },
    isClubTeam: { type: Boolean, default: false },
    logo: { type: mediaSchema, default: null },
    description: { type: String, maxlength: 4000, default: '' },
    category: { type: String, trim: true, maxlength: 60, default: '' },
    ageGroup: { type: String, trim: true, maxlength: 30, default: '' },
    homeVenue: { type: String, trim: true, maxlength: 150, default: '' },
    competitions: [{ type: Schema.Types.ObjectId, ref: 'Competition' }],
    season: { type: Schema.Types.ObjectId, ref: 'Season', default: null },
    status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active' },
    displayOrder: { type: Number, default: 100 },
    containsMinors: { type: Boolean, default: false },
  },
  { timestamps: true },
);
teamSchema.index({ slug: 1 }, { unique: true });
teamSchema.index({ isClubTeam: 1, status: 1, displayOrder: 1 });

// ---------------------------------------------------------------------------- Competition
const competitionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    shortName: { type: String, trim: true, maxlength: 30, default: '' },
    slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 140 },
    logo: { type: mediaSchema, default: null },
    description: { type: String, maxlength: 4000, default: '' },
    organizer: { type: String, trim: true, maxlength: 150, default: '' },
    type: { type: String, enum: ['league', 'cup', 'friendly'], default: 'league' },
    rules: {
      pointsWin: { type: Number, default: 3, min: 0, max: 10 },
      pointsDraw: { type: Number, default: 1, min: 0, max: 10 },
      pointsLoss: { type: Number, default: 0, min: 0, max: 10 },
      tieBreakers: {
        type: [String],
        enum: ['points', 'goal_difference', 'goals_for', 'head_to_head', 'wins', 'name'],
        default: ['points', 'goal_difference', 'goals_for', 'head_to_head', 'name'],
      },
      countsForStandings: { type: Boolean, default: true },
    },
    seasons: [{ type: Schema.Types.ObjectId, ref: 'Season' }],
    currentSeason: { type: Schema.Types.ObjectId, ref: 'Season', default: null },
    teams: [{ type: Schema.Types.ObjectId, ref: 'Team' }],
    status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active' },
    displayOrder: { type: Number, default: 100 },
  },
  { timestamps: true },
);
competitionSchema.index({ slug: 1 }, { unique: true });
competitionSchema.index({ status: 1, displayOrder: 1 });

// ---------------------------------------------------------------------------- Match
export const MATCH_STATUSES = ['scheduled', 'live', 'completed', 'postponed', 'cancelled', 'abandoned'];
export const EVENT_TYPES = ['goal', 'penalty_goal', 'own_goal', 'penalty_miss', 'yellow_card', 'second_yellow', 'red_card', 'substitution'];

const eventSchema = new Schema(
  {
    type: { type: String, enum: EVENT_TYPES, required: true },
    minute: { type: Number, min: 0, max: 150, required: true },
    addedTime: { type: Number, min: 0, max: 30, default: 0 },
    side: { type: String, enum: ['home', 'away'], required: true },
    // Club players are linked; opponents are recorded by name only.
    player: { type: Schema.Types.ObjectId, ref: 'Player', default: null },
    playerName: { type: String, maxlength: 120, default: '' },
    assist: { type: Schema.Types.ObjectId, ref: 'Player', default: null },
    assistName: { type: String, maxlength: 120, default: '' },
    playerOff: { type: Schema.Types.ObjectId, ref: 'Player', default: null },
    playerOffName: { type: String, maxlength: 120, default: '' },
    note: { type: String, maxlength: 200, default: '' },
  },
  { _id: true },
);

const lineupEntrySchema = new Schema(
  {
    player: { type: Schema.Types.ObjectId, ref: 'Player', required: true },
    starter: { type: Boolean, default: true },
    minutes: { type: Number, min: 0, max: 150, default: null },
    shirtNumber: { type: Number, min: 1, max: 99, default: null },
  },
  { _id: false },
);

const statPairSchema = new Schema({ home: { type: Number, min: 0, default: null }, away: { type: Number, min: 0, default: null } }, { _id: false });

const matchSchema = new Schema(
  {
    competition: { type: Schema.Types.ObjectId, ref: 'Competition', required: true },
    season: { type: Schema.Types.ObjectId, ref: 'Season', required: true },
    homeTeam: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    awayTeam: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    kickoffAt: { type: Date, required: true },
    venue: { type: String, trim: true, maxlength: 150, default: '' },
    referee: { type: String, trim: true, maxlength: 120, default: '' },
    round: { type: String, trim: true, maxlength: 60, default: '' },
    status: { type: String, enum: MATCH_STATUSES, default: 'scheduled' },
    statusNote: { type: String, maxlength: 300, default: '' },
    score: {
      home: { type: Number, min: 0, max: 99, default: null },
      away: { type: Number, min: 0, max: 99, default: null },
      homePenalties: { type: Number, min: 0, max: 99, default: null },
      awayPenalties: { type: Number, min: 0, max: 99, default: null },
    },
    events: { type: [eventSchema], default: [] },
    lineups: {
      home: { type: [lineupEntrySchema], default: [] },
      away: { type: [lineupEntrySchema], default: [] },
    },
    stats: {
      possession: { type: statPairSchema, default: () => ({}) },
      shots: { type: statPairSchema, default: () => ({}) },
      shotsOnTarget: { type: statPairSchema, default: () => ({}) },
      corners: { type: statPairSchema, default: () => ({}) },
      fouls: { type: statPairSchema, default: () => ({}) },
      offsides: { type: statPairSchema, default: () => ({}) },
    },
    report: {
      title: { type: String, maxlength: 200, default: '' },
      body: { type: String, maxlength: 20000, default: '' },
      author: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      publishedAt: { type: Date, default: null },
    },
    // Completed matches count unless excluded. An abandoned match counts only after an
    // authorised, audited decision that its result stands. Cancelled matches never count.
    countsForStandings: { type: Boolean, default: true },
    resultStands: { type: Boolean, default: false },
    highlightsVideo: { type: Schema.Types.ObjectId, ref: 'Video', default: null },
    resultRecordedAt: { type: Date, default: null },
    resultRecordedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);
matchSchema.index({ kickoffAt: 1, status: 1 });
matchSchema.index({ competition: 1, season: 1, status: 1 });
matchSchema.index({ homeTeam: 1, kickoffAt: -1 });
matchSchema.index({ awayTeam: 1, kickoffAt: -1 });
matchSchema.index({ 'lineups.home.player': 1 });
matchSchema.index({ 'lineups.away.player': 1 });

// ---------------------------------------------------------------------------- Standings correction
/** An explicit, audited correction applied on top of calculated standings. */
const standingsAdjustmentSchema = new Schema(
  {
    competition: { type: Schema.Types.ObjectId, ref: 'Competition', required: true },
    season: { type: Schema.Types.ObjectId, ref: 'Season', required: true },
    team: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    points: { type: Number, default: 0, min: -100, max: 100 },
    goalsFor: { type: Number, default: 0, min: -100, max: 100 },
    goalsAgainst: { type: Number, default: 0, min: -100, max: 100 },
    reason: { type: String, required: true, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);
standingsAdjustmentSchema.index({ competition: 1, season: 1 });

export const Season = mongoose.models.Season || mongoose.model('Season', seasonSchema);
export const Team = mongoose.models.Team || mongoose.model('Team', teamSchema);
export const Competition = mongoose.models.Competition || mongoose.model('Competition', competitionSchema);
export const Match = mongoose.models.Match || mongoose.model('Match', matchSchema);
export const StandingsAdjustment =
  mongoose.models.StandingsAdjustment || mongoose.model('StandingsAdjustment', standingsAdjustmentSchema);

import mongoose from 'mongoose';
import { mediaSchema } from './_shared.js';

const { Schema } = mongoose;

// ---------------------------------------------------------------------------- Staff report
export const REPORT_TYPES = ['general', 'match', 'training', 'observation', 'incident', 'recommendation', 'medical', 'technical'];
export const REPORT_STATUSES = ['submitted', 'under_review', 'reviewed', 'archived'];

/** Operational records. Never used to rank staff. */
const reportSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, maxlength: 120, required: true },
    authorRole: { type: String, maxlength: 40, required: true },
    type: { type: String, enum: REPORT_TYPES, default: 'general' },
    title: { type: String, required: true, maxlength: 200 },
    content: { type: String, required: true, maxlength: 20000 },
    team: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    player: { type: Schema.Types.ObjectId, ref: 'Player', default: null },
    match: { type: Schema.Types.ObjectId, ref: 'Match', default: null },
    status: { type: String, enum: REPORT_STATUSES, default: 'submitted' },
    reviewer: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, maxlength: 3000, default: '' },
  },
  { timestamps: true },
);
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ author: 1, createdAt: -1 });
reportSchema.index({ team: 1, createdAt: -1 });

// ---------------------------------------------------------------------------- Scouting (PRIVATE)
const subjectSchema = new Schema(
  {
    // Either an existing club player, or an external prospect described by name.
    player: { type: Schema.Types.ObjectId, ref: 'Player', default: null },
    name: { type: String, maxlength: 120, default: '' },
    currentClub: { type: String, maxlength: 120, default: '' },
    position: { type: String, maxlength: 60, default: '' },
    birthYear: { type: Number, min: 1950, max: 2100, default: null },
    location: { type: String, maxlength: 120, default: '' },
  },
  { _id: false },
);

const scoutingAssignmentSchema = new Schema(
  {
    scout: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: subjectSchema, required: true },
    instructions: { type: String, maxlength: 3000, default: '' },
    dueDate: { type: Date, default: null },
    status: { type: String, enum: ['open', 'in_progress', 'completed', 'cancelled'], default: 'open' },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);
scoutingAssignmentSchema.index({ scout: 1, status: 1, dueDate: 1 });

const scoutingReportSchema = new Schema(
  {
    scout: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    scoutName: { type: String, maxlength: 120, required: true },
    assignment: { type: Schema.Types.ObjectId, ref: 'ScoutingAssignment', default: null },
    subject: { type: subjectSchema, required: true },
    matchObserved: { type: String, maxlength: 200, default: '' },
    observedAt: { type: Date, default: null },
    observations: { type: String, required: true, maxlength: 20000 },
    strengths: { type: String, maxlength: 3000, default: '' },
    weaknesses: { type: String, maxlength: 3000, default: '' },
    ratings: {
      technical: { type: Number, min: 1, max: 10, default: null },
      tactical: { type: Number, min: 1, max: 10, default: null },
      physical: { type: Number, min: 1, max: 10, default: null },
      mental: { type: Number, min: 1, max: 10, default: null },
      potential: { type: Number, min: 1, max: 10, default: null },
    },
    recommendation: { type: String, enum: ['sign', 'monitor', 'trial', 'reject', 'undecided'], default: 'undecided' },
    attachments: { type: [mediaSchema], default: [] },
    status: { type: String, enum: ['draft', 'submitted', 'reviewed'], default: 'submitted' },
  },
  { timestamps: true },
);
scoutingReportSchema.index({ scout: 1, createdAt: -1 });
scoutingReportSchema.index({ 'subject.player': 1 });

// ---------------------------------------------------------------------------- Audit
const auditLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, maxlength: 120, default: '' },
    actorEmail: { type: String, maxlength: 254, default: '' },
    action: { type: String, required: true, maxlength: 80 },
    entityType: { type: String, maxlength: 60, default: '' },
    entityId: { type: String, maxlength: 60, default: '' },
    status: { type: String, enum: ['success', 'failure', 'denied'], default: 'success' },
    ip: { type: String, maxlength: 64, default: '' },
    userAgent: { type: String, maxlength: 300, default: '' },
    requestId: { type: String, maxlength: 64, default: '' },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

// ---------------------------------------------------------------------------- Club settings
const valueSchema = new Schema({ title: { type: String, maxlength: 80 }, description: { type: String, maxlength: 600 } }, { _id: false });
const honourSchema = new Schema(
  { title: { type: String, maxlength: 150 }, competition: { type: String, maxlength: 150 }, years: { type: String, maxlength: 200 } },
  { _id: false },
);
const legalDocSchema = new Schema(
  {
    version: { type: String, maxlength: 20, default: '1.0' },
    body: { type: String, maxlength: 60000, default: '' },
    updatedAt: { type: Date, default: null },
    approved: { type: Boolean, default: false },
  },
  { _id: false },
);

/** Singleton (key: "club"). One place for club identity instead of hard-coded React. */
const clubSettingsSchema = new Schema(
  {
    key: { type: String, default: 'club' },
    name: { type: String, maxlength: 120, default: 'Saki Stars Sports Club' },
    shortName: { type: String, maxlength: 40, default: 'Saki Stars' },
    tagline: { type: String, maxlength: 200, default: '' },
    heroHeadline: { type: String, maxlength: 200, default: '' },
    heroText: { type: String, maxlength: 600, default: '' },
    logo: { type: mediaSchema, default: null },
    heroImage: { type: mediaSchema, default: null },
    founded: { type: String, maxlength: 20, default: '' },
    about: { type: String, maxlength: 10000, default: '' },
    history: { type: String, maxlength: 20000, default: '' },
    mission: { type: String, maxlength: 2000, default: '' },
    vision: { type: String, maxlength: 2000, default: '' },
    values: { type: [valueSchema], default: [] },
    honours: { type: [honourSchema], default: [] },
    stadium: {
      name: { type: String, maxlength: 150, default: '' },
      address: { type: String, maxlength: 300, default: '' },
      capacity: { type: Number, default: null },
      description: { type: String, maxlength: 3000, default: '' },
      mapUrl: { type: String, maxlength: 500, default: '' },
      image: { type: mediaSchema, default: null },
    },
    contact: {
      email: { type: String, maxlength: 254, default: '' },
      phone: { type: String, maxlength: 40, default: '' },
      address: { type: String, maxlength: 300, default: '' },
      officeHours: { type: String, maxlength: 200, default: '' },
    },
    social: {
      facebook: { type: String, maxlength: 300, default: '' },
      instagram: { type: String, maxlength: 300, default: '' },
      x: { type: String, maxlength: 300, default: '' },
      youtube: { type: String, maxlength: 300, default: '' },
      tiktok: { type: String, maxlength: 300, default: '' },
    },
    seo: {
      title: { type: String, maxlength: 120, default: '' },
      description: { type: String, maxlength: 300, default: '' },
      image: { type: mediaSchema, default: null },
    },
    timezone: { type: String, maxlength: 60, default: 'Africa/Lagos' },
    emailSenderName: { type: String, maxlength: 80, default: '' },
    features: {
      comments: { type: Boolean, default: true },
      newsletter: { type: Boolean, default: true },
      playerApplications: { type: Boolean, default: true },
      staffApplications: { type: Boolean, default: true },
    },
    legal: {
      terms: { type: legalDocSchema, default: () => ({}) },
      privacy: { type: legalDocSchema, default: () => ({}) },
      cookies: { type: legalDocSchema, default: () => ({}) },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);
clubSettingsSchema.index({ key: 1 }, { unique: true });

export const Report = mongoose.models.Report || mongoose.model('Report', reportSchema);
export const ScoutingAssignment =
  mongoose.models.ScoutingAssignment || mongoose.model('ScoutingAssignment', scoutingAssignmentSchema);
export const ScoutingReport = mongoose.models.ScoutingReport || mongoose.model('ScoutingReport', scoutingReportSchema);
export const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
export const ClubSettings = mongoose.models.ClubSettings || mongoose.model('ClubSettings', clubSettingsSchema);

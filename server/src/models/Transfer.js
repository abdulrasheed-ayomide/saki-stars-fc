import mongoose from 'mongoose';
import { mediaSchema } from './_shared.js';

const { Schema } = mongoose;

/**
 * Player transfers (PRIVATE staff records). Nothing here is ever returned by a public endpoint.
 *
 * Lifecycle (enforced by TRANSFER_TRANSITIONS in the routes, never by the client):
 *   draft → pending_approval → approved → in_progress → completed
 *   pending_approval → rejected → (reopened as) draft
 *   draft / pending_approval / approved / in_progress → cancelled
 */
export const TRANSFER_DIRECTIONS = ['incoming', 'outgoing'];
export const TRANSFER_TYPES = ['permanent', 'loan', 'loan_return', 'free', 'other'];
export const TRANSFER_WINDOWS = ['main', 'mid_season', 'outside_window'];
export const TRANSFER_STATUSES = ['draft', 'pending_approval', 'approved', 'in_progress', 'completed', 'rejected', 'cancelled'];
/** Statuses in which a transfer is still open (a player can have only one open transfer per direction). */
export const OPEN_TRANSFER_STATUSES = ['draft', 'pending_approval', 'approved', 'in_progress'];
export const TRANSFER_DOCUMENT_KINDS = ['contract', 'clearance', 'agreement', 'medical', 'registration', 'other'];

const userRef = { type: Schema.Types.ObjectId, ref: 'User', default: null };

const historySchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    by: userRef,
    byName: { type: String, maxlength: 120, default: '' },
    action: { type: String, maxlength: 60, required: true },
    fromStatus: { type: String, maxlength: 30, default: '' },
    toStatus: { type: String, maxlength: 30, default: '' },
    note: { type: String, maxlength: 2000, default: '' },
    // Field names (and, for player updates, old → new values) changed by this step.
    changes: { type: Schema.Types.Mixed, default: undefined },
  },
  { _id: true },
);

const documentSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 150 },
    kind: { type: String, enum: TRANSFER_DOCUMENT_KINDS, default: 'other' },
    file: { type: mediaSchema, required: true },
    uploadedBy: userRef,
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const transferSchema = new Schema(
  {
    reference: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 },
    direction: { type: String, enum: TRANSFER_DIRECTIONS, required: true },

    // An existing club player (required for outgoing), or, for incoming players who are not
    // registered yet, a description only. No Player record is ever created from a transfer.
    player: { type: Schema.Types.ObjectId, ref: 'Player', default: null },
    externalPlayer: {
      firstName: { type: String, trim: true, maxlength: 60, default: '' },
      lastName: { type: String, trim: true, maxlength: 60, default: '' },
      position: { type: String, trim: true, maxlength: 60, default: '' },
      nationality: { type: String, trim: true, maxlength: 60, default: '' },
      dateOfBirth: { type: Date, default: null },
    },
    // Name at the time of the transfer, for search and history (the player record may change later).
    playerName: { type: String, trim: true, maxlength: 130, required: true },

    fromClub: { type: String, trim: true, maxlength: 120, required: true },
    toClub: { type: String, trim: true, maxlength: 120, required: true },
    // The club's own team the player joins or leaves, when known.
    clubTeam: { type: Schema.Types.ObjectId, ref: 'Team', default: null },

    type: { type: String, enum: TRANSFER_TYPES, required: true },
    season: { type: Schema.Types.ObjectId, ref: 'Season', default: null },
    window: { type: String, enum: [...TRANSFER_WINDOWS, ''], default: '' },
    proposedDate: { type: Date, default: null },
    effectiveDate: { type: Date, default: null },
    loanEndDate: { type: Date, default: null },

    reason: { type: String, maxlength: 2000, default: '' },
    internalNotes: { type: String, maxlength: 5000, default: '' },
    documents: { type: [documentSchema], default: [] },

    status: { type: String, enum: TRANSFER_STATUSES, default: 'draft' },
    submittedBy: userRef,
    submittedAt: { type: Date, default: null },
    approval: {
      decision: { type: String, enum: ['approved', 'rejected', null], default: null },
      by: userRef,
      byName: { type: String, maxlength: 120, default: '' },
      at: { type: Date, default: null },
      note: { type: String, maxlength: 2000, default: '' },
    },
    completedBy: userRef,
    completedAt: { type: Date, default: null },
    cancelledBy: userRef,
    cancelledAt: { type: Date, default: null },

    // Set only while the transfer is open: "<playerId>:<direction>". The unique sparse index
    // stops two open transfers for the same player and direction, even under concurrent requests.
    openKey: { type: String, default: undefined },

    // A news DRAFT created on request ("Create news draft"); never published automatically.
    announcement: {
      news: { type: Schema.Types.ObjectId, ref: 'News', default: null },
      by: userRef,
      at: { type: Date, default: null },
    },

    history: { type: [historySchema], default: [] },
    createdBy: userRef,
    updatedBy: userRef,
  },
  { timestamps: true },
);

transferSchema.index({ reference: 1 }, { unique: true });
transferSchema.index({ openKey: 1 }, { unique: true, sparse: true });
transferSchema.index({ status: 1, createdAt: -1 });
transferSchema.index({ direction: 1, status: 1 });
transferSchema.index({ player: 1, createdAt: -1 });
transferSchema.index({ season: 1 });

/** Per-year sequence for transfer references (TR-2026-0001). Incremented atomically. */
const transferCounterSchema = new Schema({ _id: { type: String }, seq: { type: Number, default: 0 } }, { versionKey: false });

export const Transfer = mongoose.models.Transfer || mongoose.model('Transfer', transferSchema);
export const TransferCounter = mongoose.models.TransferCounter || mongoose.model('TransferCounter', transferCounterSchema);

export async function nextTransferReference(date = new Date()) {
  const year = date.getUTCFullYear();
  const counter = await TransferCounter.findOneAndUpdate({ _id: `transfer-${year}` }, { $inc: { seq: 1 } }, { upsert: true, new: true }).lean();
  return `TR-${year}-${String(counter.seq).padStart(4, '0')}`;
}

import mongoose from 'mongoose';
import { mediaSchema } from './_shared.js';
import { STAFF_ROLE_KEYS, PERMISSION_KEYS, SCOPE_ORDER } from '../auth/permissions.js';

const { Schema } = mongoose;

const grantSchema = new Schema(
  {
    permission: { type: String, enum: PERMISSION_KEYS, required: true },
    scope: { type: String, enum: SCOPE_ORDER, required: true },
  },
  { _id: false },
);

/**
 * Staff identity. A staff record may have a login (user) or be a public-only profile,
 * e.g. a coach listed on the Club page who never signs in.
 */
const staffSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', default: undefined },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    staffRole: { type: String, enum: [...STAFF_ROLE_KEYS, 'other'], required: true },
    title: { type: String, trim: true, maxlength: 120, default: '' },
    department: { type: String, trim: true, maxlength: 120, default: '' },
    category: { type: String, enum: ['management', 'coaching', 'operations', 'medical', 'other'], default: 'management' },
    team: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    bio: { type: String, maxlength: 3000, default: '' },
    background: { type: String, maxlength: 3000, default: '' },
    photo: { type: mediaSchema, default: null },
    dateJoined: { type: Date, default: null },
    showOnWebsite: { type: Boolean, default: false },
    showDateJoined: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 100 },

    status: { type: String, enum: ['active', 'suspended', 'removed'], default: 'active' },
    grants: { type: [grantSchema], default: [] },
    assignedTeams: [{ type: Schema.Types.ObjectId, ref: 'Team' }],
    assignedPlayers: [{ type: Schema.Types.ObjectId, ref: 'Player' }],

    // Private: never serialised to public responses.
    privatePhone: { type: String, maxlength: 40, default: '' },
    internalNotes: { type: String, maxlength: 3000, default: '' },
  },
  { timestamps: true },
);

staffSchema.index({ user: 1 }, { unique: true, sparse: true });
staffSchema.index({ showOnWebsite: 1, status: 1, displayOrder: 1 });
staffSchema.index({ staffRole: 1, status: 1 });

export const Staff = mongoose.models.Staff || mongoose.model('Staff', staffSchema);

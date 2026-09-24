import mongoose from 'mongoose';
import { mediaSchema } from './_shared.js';
import { uniqueSlug } from '../utils/text.js';

const { Schema } = mongoose;

export const POSITIONS = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];
export const PLAYER_STATUSES = ['active', 'inactive', 'injured', 'on_loan', 'released', 'archived'];

const documentSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 150 },
    kind: { type: String, enum: ['id', 'consent', 'medical', 'registration', 'other'], default: 'other' },
    file: { type: mediaSchema, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

/**
 * Football identity. Fields are grouped by data classification:
 *   PUBLIC            – top level fields serialised by toPublicPlayer()
 *   RESTRICTED        – `restricted` (contacts, emergency contact, guardian, internal notes, documents)
 *   HIGHLY_SENSITIVE  – `sensitive` (national ID, medical)
 * Nothing outside PUBLIC is ever returned by public endpoints.
 */
const playerSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', default: undefined },

    // PUBLIC
    firstName: { type: String, required: true, trim: true, maxlength: 60 },
    lastName: { type: String, required: true, trim: true, maxlength: 60 },
    knownAs: { type: String, trim: true, maxlength: 60, default: '' },
    slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 140 },
    photo: { type: mediaSchema, default: null },
    position: { type: String, enum: POSITIONS, required: true },
    detailedPosition: { type: String, maxlength: 60, default: '' },
    jerseyNumber: { type: Number, min: 1, max: 99, default: null },
    team: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    nationality: { type: String, trim: true, maxlength: 60, default: '' },
    bio: { type: String, maxlength: 4000, default: '' },
    preferredFoot: { type: String, enum: ['left', 'right', 'both', ''], default: '' },
    featured: { type: Boolean, default: false },
    showOnWebsite: { type: Boolean, default: true },
    status: { type: String, enum: PLAYER_STATUSES, default: 'active' },
    joinedAt: { type: Date, default: null },

    // Minor protection: age is derived privately; the club decides what minors show publicly.
    isMinor: { type: Boolean, default: false },
    hidePhotoPublicly: { type: Boolean, default: false },
    hideFullNamePublicly: { type: Boolean, default: false },

    // AUTHENTICATED/RESTRICTED
    restricted: {
      dateOfBirth: { type: Date, default: null },
      phone: { type: String, maxlength: 40, default: '' },
      email: { type: String, maxlength: 254, default: '' },
      address: { type: String, maxlength: 400, default: '' },
      emergencyContact: {
        name: { type: String, maxlength: 120, default: '' },
        relationship: { type: String, maxlength: 60, default: '' },
        phone: { type: String, maxlength: 40, default: '' },
      },
      guardian: {
        name: { type: String, maxlength: 120, default: '' },
        relationship: { type: String, maxlength: 60, default: '' },
        phone: { type: String, maxlength: 40, default: '' },
        email: { type: String, maxlength: 254, default: '' },
        consentGivenAt: { type: Date, default: null },
        consentPolicyVersion: { type: String, default: null },
      },
      internalNotes: { type: String, maxlength: 5000, default: '' },
      documents: { type: [documentSchema], default: [] },
    },

    // HIGHLY_SENSITIVE
    sensitive: {
      nationalId: { type: String, maxlength: 60, default: '' },
      medicalNotes: { type: String, maxlength: 5000, default: '' },
    },

    // Official stats that were recorded before this system existed (e.g. earlier seasons).
    statAdjustments: {
      appearances: { type: Number, default: 0 },
      goals: { type: Number, default: 0 },
      assists: { type: Number, default: 0 },
    },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

/**
 * The public URL follows the public name: when the surname is hidden (all minors by default)
 * the slug uses only the first name and initial, so the surname cannot leak through links,
 * the sitemap or browser history. Recomputed whenever the name or that setting changes.
 */
export function publicSlugBase(p) {
  return p.hideFullNamePublicly ? `${p.firstName} ${String(p.lastName || '').charAt(0)}` : `${p.firstName} ${p.lastName}`;
}

playerSchema.pre('validate', async function assignSlug() {
  const nameChanged = this.isModified('firstName') || this.isModified('lastName') || this.isModified('hideFullNamePublicly');
  if (this.slug && !this.isNew && !nameChanged) return;
  this.slug = await uniqueSlug(this.constructor, publicSlugBase(this), { excludeId: this._id });
});

playerSchema.index({ slug: 1 }, { unique: true });
playerSchema.index({ user: 1 }, { unique: true, sparse: true });
playerSchema.index({ team: 1, status: 1, lastName: 1 });
playerSchema.index({ featured: 1, showOnWebsite: 1 });

export const Player = mongoose.models.Player || mongoose.model('Player', playerSchema);

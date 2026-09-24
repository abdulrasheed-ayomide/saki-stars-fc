import mongoose from 'mongoose';

const { Schema } = mongoose;

export const USER_STATUSES = ['pending', 'active', 'suspended', 'deactivated', 'rejected'];
export const USER_ROLES = ['user', 'player', 'staff'];

/**
 * Authentication / account identity only. Football identity lives in Player,
 * staff identity in Staff, so removing a login never destroys club history.
 */
const userSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, default: 'user' },
    status: { type: String, enum: USER_STATUSES, default: 'pending' },

    emailVerifiedAt: { type: Date, default: null },
    emailVerifyTokenHash: { type: String, select: false, default: null },
    emailVerifyExpiresAt: { type: Date, select: false, default: null },

    passwordResetTokenHash: { type: String, select: false, default: null },
    passwordResetExpiresAt: { type: Date, select: false, default: null },
    passwordChangedAt: { type: Date, default: null },

    failedLoginCount: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },
    lastLoginAt: { type: Date, default: null },

    player: { type: Schema.Types.ObjectId, ref: 'Player', default: null },
    staff: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },

    consents: {
      termsVersion: { type: String, default: null },
      privacyVersion: { type: String, default: null },
      acceptedAt: { type: Date, default: null },
    },

    statusReason: { type: String, maxlength: 500, default: '' },
    statusChangedAt: { type: Date, default: null },
    statusChangedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletionRequestedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    anonymizedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ status: 1, role: 1, createdAt: -1 });

export const User = mongoose.models.User || mongoose.model('User', userSchema);

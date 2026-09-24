import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * One document per issued refresh token. Only a SHA-256 hash of the token is stored.
 * Rotation creates a new document in the same family and marks the old one rotated;
 * presenting a rotated token again is treated as theft and revokes the whole family.
 */
const refreshSessionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    familyId: { type: String, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    rotatedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokeReason: { type: String, default: null },
    userAgent: { type: String, maxlength: 300, default: '' },
    ip: { type: String, maxlength: 64, default: '' },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

refreshSessionSchema.index({ tokenHash: 1 }, { unique: true });
refreshSessionSchema.index({ user: 1, familyId: 1 });
refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshSession = mongoose.models.RefreshSession || mongoose.model('RefreshSession', refreshSessionSchema);

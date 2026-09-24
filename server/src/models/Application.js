import mongoose from 'mongoose';
import { STAFF_ROLE_KEYS } from '../auth/permissions.js';
import { POSITIONS } from './Player.js';

const { Schema } = mongoose;

const reviewFields = {
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'withdrawn'], default: 'pending' },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, maxlength: 2000, default: '' },
};

const playerApplicationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    firstName: { type: String, required: true, maxlength: 60 },
    lastName: { type: String, required: true, maxlength: 60 },
    dateOfBirth: { type: Date, required: true },
    nationality: { type: String, maxlength: 60, default: '' },
    phone: { type: String, required: true, maxlength: 40 },
    address: { type: String, maxlength: 400, default: '' },
    position: { type: String, enum: POSITIONS, required: true },
    preferredFoot: { type: String, enum: ['left', 'right', 'both', ''], default: '' },
    preferredTeam: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    previousClubs: { type: String, maxlength: 1000, default: '' },
    experience: { type: String, maxlength: 2000, default: '' },
    statement: { type: String, maxlength: 2000, default: '' },
    emergencyContact: {
      name: { type: String, maxlength: 120, default: '' },
      relationship: { type: String, maxlength: 60, default: '' },
      phone: { type: String, maxlength: 40, default: '' },
    },
    isMinor: { type: Boolean, default: false },
    guardian: {
      name: { type: String, maxlength: 120, default: '' },
      relationship: { type: String, maxlength: 60, default: '' },
      phone: { type: String, maxlength: 40, default: '' },
      email: { type: String, maxlength: 254, default: '' },
      consentGivenAt: { type: Date, default: null },
      consentPolicyVersion: { type: String, default: null },
    },
    ...reviewFields,
    player: { type: Schema.Types.ObjectId, ref: 'Player', default: null },
  },
  { timestamps: true },
);
playerApplicationSchema.index({ status: 1, createdAt: -1 });
playerApplicationSchema.index({ user: 1, createdAt: -1 });

const staffApplicationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fullName: { type: String, required: true, maxlength: 120 },
    requestedRole: { type: String, enum: STAFF_ROLE_KEYS.filter((r) => r !== 'director'), required: true },
    phone: { type: String, required: true, maxlength: 40 },
    experience: { type: String, maxlength: 3000, default: '' },
    qualifications: { type: String, maxlength: 2000, default: '' },
    statement: { type: String, maxlength: 2000, default: '' },
    preferredTeam: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    ...reviewFields,
    assignedRole: { type: String, default: null },
    staff: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
  },
  { timestamps: true },
);
staffApplicationSchema.index({ status: 1, createdAt: -1 });
staffApplicationSchema.index({ user: 1, createdAt: -1 });

export const PlayerApplication =
  mongoose.models.PlayerApplication || mongoose.model('PlayerApplication', playerApplicationSchema);
export const StaffApplication =
  mongoose.models.StaffApplication || mongoose.model('StaffApplication', staffApplicationSchema);

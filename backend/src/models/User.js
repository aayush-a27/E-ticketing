import mongoose from 'mongoose';
import { ROLES, ROLE_VALUES, ACCOUNT_STATUS, ACCOUNT_STATUS_VALUES } from '../constants/index.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    phone: { type: String, trim: true, maxlength: 20 },
    passwordHash: { type: String, required: true, select: false },

    // Authoritative authorization state. Never settable from a request body;
    // see the explicit allow-lists in the auth and admin services.
    role: { type: String, enum: ROLE_VALUES, default: ROLES.CUSTOMER, index: true },
    accountStatus: {
      type: String,
      enum: ACCOUNT_STATUS_VALUES,
      default: ACCOUNT_STATUS.ACTIVE,
      index: true,
    },

    // Bumped on logout-all, password change, suspension and role change, which
    // invalidates every token already issued to this user.
    tokenVersion: { type: Number, default: 0 },

    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
    passwordChangedAt: { type: Date },
    lastLoginAt: { type: Date },

    preferredCity: { type: String, trim: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.passwordHash;
        delete ret.passwordResetTokenHash;
        delete ret.passwordResetExpiresAt;
        delete ret.__v;
        return ret;
      },
    },
  },
);

userSchema.index({ role: 1, accountStatus: 1 });

userSchema.virtual('isActive').get(function isActive() {
  return this.accountStatus === ACCOUNT_STATUS.ACTIVE;
});

/** The shape returned to clients. Nothing sensitive, nothing internal. */
userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: String(this._id),
    name: this.name,
    email: this.email,
    phone: this.phone ?? null,
    role: this.role,
    accountStatus: this.accountStatus,
    preferredCity: this.preferredCity ?? null,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);

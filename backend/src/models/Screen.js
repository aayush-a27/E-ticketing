import mongoose from 'mongoose';
import { SCREEN_FORMATS } from '../constants/index.js';

const screenSchema = new mongoose.Schema(
  {
    theaterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Theater', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },

    formats: {
      type: [String],
      enum: SCREEN_FORMATS,
      default: ['2D'],
      validate: [(value) => value.length > 0, 'A screen supports at least one format'],
    },

    /**
     * Points at the SeatLayout currently used for new shows. Existing shows
     * keep the version they were scheduled with, so relaying a screen never
     * changes the seats on a ticket already sold.
     */
    activeLayoutVersion: { type: Number, default: null },
    capacity: { type: Number, default: 0 },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

screenSchema.index({ theaterId: 1, name: 1 }, { unique: true });
screenSchema.index({ theaterId: 1, isActive: 1 });

export const Screen = mongoose.model('Screen', screenSchema);

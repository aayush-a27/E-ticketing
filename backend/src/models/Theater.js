import mongoose from 'mongoose';
import { THEATER_STATUS, THEATER_STATUS_VALUES } from '../constants/index.js';

const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    caption: { type: String, trim: true, maxlength: 160 },
  },
  { _id: false },
);

const geoPointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
      validate: {
        validator: (value) =>
          value.length === 2 &&
          value[0] >= -180 &&
          value[0] <= 180 &&
          value[1] >= -90 &&
          value[1] <= 90,
        message: 'Coordinates must be [longitude, latitude] within valid ranges',
      },
    },
  },
  { _id: false },
);

const theaterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },

    addressLine1: { type: String, required: true, trim: true, maxlength: 240 },
    addressLine2: { type: String, trim: true, maxlength: 240 },
    // Stored lowercase so "Dehradun" and "dehradun" are one city when browsing.
    city: { type: String, required: true, trim: true, lowercase: true, maxlength: 80 },
    cityLabel: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    pincode: { type: String, required: true, trim: true, maxlength: 12 },

    /**
     * Absent unless coordinates are given. A GeoJSON point with no coordinates
     * is rejected by the 2dsphere index, so `default: undefined` keeps the
     * whole subdocument off the record rather than leaving a half-built one.
     */
    location: { type: geoPointSchema, default: undefined },

    contactPhone: { type: String, trim: true, maxlength: 20 },
    contactEmail: { type: String, lowercase: true, trim: true, maxlength: 254 },
    images: { type: [mediaSchema], default: [] },
    amenities: { type: [String], default: [] },

    status: {
      type: String,
      enum: THEATER_STATUS_VALUES,
      default: THEATER_STATUS.ACTIVE,
      index: true,
    },

    /**
     * Gate 4. A show runner may act on this theater only if their id is here.
     * Assignment is a super-admin decision, separate from being approved as a
     * show runner at all.
     */
    managers: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
      index: true,
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

theaterSchema.index({ city: 1, status: 1 });
theaterSchema.index({ location: '2dsphere' });
theaterSchema.index({ name: 'text', cityLabel: 'text' }, { name: 'theater_text_search' });

theaterSchema.methods.isManagedBy = function isManagedBy(userId) {
  return this.managers.some((manager) => String(manager) === String(userId));
};

theaterSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: String(this._id),
    name: this.name,
    slug: this.slug,
    address: [this.addressLine1, this.addressLine2].filter(Boolean).join(', '),
    city: this.cityLabel,
    state: this.state,
    pincode: this.pincode,
    location: this.location?.coordinates?.length ? this.location.coordinates : null,
    amenities: this.amenities,
    images: this.images.map((image) => ({ url: image.url, caption: image.caption ?? null })),
  };
};

export const Theater = mongoose.model('Theater', theaterSchema);

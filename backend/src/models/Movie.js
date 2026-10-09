import mongoose from 'mongoose';
import { MOVIE_STATUS, MOVIE_STATUS_VALUES } from '../constants/index.js';

/**
 * A Cloudinary asset. The publicId is what lets the platform delete or replace
 * the file later; without it an orphaned upload can never be cleaned up.
 */
const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    width: { type: Number },
    height: { type: Number },
    format: { type: String },
    bytes: { type: Number },
  },
  { _id: false },
);

const castMemberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    character: { type: String, trim: true, maxlength: 120 },
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const crewMemberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    job: { type: String, required: true, trim: true, maxlength: 80 },
  },
  { _id: false },
);

const movieSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    synopsis: { type: String, required: true, trim: true, maxlength: 4000 },
    tagline: { type: String, trim: true, maxlength: 240 },

    poster: { type: mediaSchema },
    backdrop: { type: mediaSchema },
    trailerUrl: { type: String, trim: true, maxlength: 500 },

    genres: { type: [String], default: [], index: true },
    languages: { type: [String], required: true },
    subtitles: { type: [String], default: [] },

    releaseDate: { type: Date, required: true },
    runtimeMinutes: { type: Number, required: true, min: 1, max: 600 },
    certification: {
      type: String,
      required: true,
      enum: ['U', 'UA', 'UA7+', 'UA13+', 'UA16+', 'A', 'S'],
    },

    director: { type: String, trim: true, maxlength: 120 },
    cast: { type: [castMemberSchema], default: [] },
    crew: { type: [crewMemberSchema], default: [] },

    isFeatured: { type: Boolean, default: false },
    status: {
      type: String,
      enum: MOVIE_STATUS_VALUES,
      default: MOVIE_STATUS.DRAFT,
      index: true,
    },
    publishedAt: { type: Date },
    archivedAt: { type: Date },

    seo: {
      metaTitle: { type: String, trim: true, maxlength: 200 },
      metaDescription: { type: String, trim: true, maxlength: 400 },
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

// Public browsing: published movies by release date, optionally by language.
movieSchema.index({ status: 1, releaseDate: -1 });
movieSchema.index({ status: 1, languages: 1 });
movieSchema.index({ status: 1, isFeatured: 1, releaseDate: -1 });
movieSchema.index({ title: 'text', synopsis: 'text' }, { name: 'movie_text_search' });

movieSchema.virtual('isPublished').get(function isPublished() {
  return this.status === MOVIE_STATUS.PUBLISHED;
});

/**
 * Only fields a customer should see. The draft catalog, the audit fields and
 * the Cloudinary publicIds stay inside the platform.
 */
movieSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: String(this._id),
    title: this.title,
    slug: this.slug,
    synopsis: this.synopsis,
    tagline: this.tagline ?? null,
    poster: this.poster ? { url: this.poster.url } : null,
    backdrop: this.backdrop ? { url: this.backdrop.url } : null,
    trailerUrl: this.trailerUrl ?? null,
    genres: this.genres,
    languages: this.languages,
    subtitles: this.subtitles,
    releaseDate: this.releaseDate,
    runtimeMinutes: this.runtimeMinutes,
    certification: this.certification,
    director: this.director ?? null,
    cast: this.cast.map((member) => ({
      name: member.name,
      character: member.character ?? null,
    })),
    isFeatured: this.isFeatured,
  };
};

export const Movie = mongoose.model('Movie', movieSchema);

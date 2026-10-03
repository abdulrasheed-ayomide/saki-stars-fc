import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Reference to a media file. The binary never lives in MongoDB.
 *   source "cloudinary" (default; all records saved before links existed): uploaded to Cloudinary.
 *   source "link": an image on another website; only its https URL is stored.
 */
export const mediaSchema = new Schema(
  {
    source: { type: String, enum: ['cloudinary', 'link'], default: 'cloudinary' },
    publicId: {
      type: String,
      maxlength: 300,
      required() {
        return this.source !== 'link';
      },
    },
    url: { type: String, required: true, maxlength: 1000 },
    resourceType: { type: String, enum: ['image', 'video', 'raw'], default: 'image' },
    deliveryType: { type: String, enum: ['upload', 'private', 'authenticated'], default: 'upload' },
    format: { type: String, maxlength: 20 },
    width: Number,
    height: Number,
    bytes: Number,
    duration: Number,
    alt: { type: String, maxlength: 300, default: '' },
  },
  { _id: false },
);

export const softDeleteFields = {
  deletedAt: { type: Date, default: null },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
};

export const { ObjectId } = Schema.Types;

import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Reference to a file stored in Cloudinary. The binary never lives in MongoDB. */
export const mediaSchema = new Schema(
  {
    publicId: { type: String, required: true, maxlength: 300 },
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

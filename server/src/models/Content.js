import mongoose from 'mongoose';
import { mediaSchema } from './_shared.js';

const { Schema } = mongoose;

// ---------------------------------------------------------------------------- News
export const NEWS_STATUSES = ['draft', 'review', 'published', 'archived'];
export const NEWS_CATEGORIES = ['Club News', 'Match Report', 'Match Preview', 'Transfers', 'Youth', 'Academy', 'Community', 'Interviews', 'Announcements'];

const newsSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 220 },
    excerpt: { type: String, trim: true, maxlength: 400, default: '' },
    content: { type: String, required: true, maxlength: 50000 },
    featuredImage: { type: mediaSchema, default: null },
    category: { type: String, enum: NEWS_CATEGORIES, default: 'Club News' },
    competition: { type: Schema.Types.ObjectId, ref: 'Competition', default: null },
    team: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    relatedMatches: [{ type: Schema.Types.ObjectId, ref: 'Match' }],
    relatedPlayers: [{ type: Schema.Types.ObjectId, ref: 'Player' }],
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, maxlength: 120, default: '' },
    status: { type: String, enum: NEWS_STATUSES, default: 'draft' },
    publishedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    allowComments: { type: Boolean, default: true },
    lastEditedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);
newsSchema.index({ slug: 1 }, { unique: true });
newsSchema.index({ status: 1, publishedAt: -1 });
newsSchema.index({ competition: 1, status: 1, publishedAt: -1 });
newsSchema.index({ team: 1, status: 1, publishedAt: -1 });

// ---------------------------------------------------------------------------- Video
export const VIDEO_CATEGORIES = [
  'Match Highlights',
  'Goals',
  'Interviews',
  'Training',
  'Behind the Scenes',
  'Press Conference',
  'Youth',
  'NEXT GEN',
  'Club TV',
];

const videoSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, maxlength: 3000, default: '' },
    category: { type: String, enum: VIDEO_CATEGORIES, required: true },
    source: { type: String, enum: ['youtube', 'cloudinary'], required: true },
    youtubeId: { type: String, maxlength: 20, default: '' },
    media: { type: mediaSchema, default: null },
    thumbnailUrl: { type: String, maxlength: 1000, default: '' },
    team: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    match: { type: Schema.Types.ObjectId, ref: 'Match', default: null },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'published' },
    featured: { type: Boolean, default: false },
    publishedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
videoSchema.index({ status: 1, category: 1, publishedAt: -1 });

// ---------------------------------------------------------------------------- Gallery
export const GALLERY_CATEGORIES = ['Matches', 'Training', 'Players', 'Youth', 'NEXT GEN', 'Fans', 'Events', 'Community'];

const galleryItemSchema = new Schema(
  {
    title: { type: String, trim: true, maxlength: 200, default: '' },
    caption: { type: String, maxlength: 1000, default: '' },
    category: { type: String, enum: GALLERY_CATEGORIES, required: true },
    image: { type: mediaSchema, required: true },
    team: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    match: { type: Schema.Types.ObjectId, ref: 'Match', default: null },
    takenAt: { type: Date, default: null },
    photographer: { type: String, maxlength: 120, default: '' },
    status: { type: String, enum: ['published', 'hidden'], default: 'published' },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
galleryItemSchema.index({ status: 1, category: 1, createdAt: -1 });

// ---------------------------------------------------------------------------- Comment
export const COMMENT_STATUSES = ['pending', 'approved', 'hidden', 'rejected', 'reported'];

const commentSchema = new Schema(
  {
    targetType: { type: String, enum: ['news', 'match'], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    parent: { type: Schema.Types.ObjectId, ref: 'Comment', default: null },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, maxlength: 120, required: true },
    body: { type: String, required: true, maxlength: 2000 },
    status: { type: String, enum: COMMENT_STATUSES, default: 'approved' },
    flaggedReason: { type: String, maxlength: 200, default: '' },
    reports: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        reason: { type: String, maxlength: 300 },
        at: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    editedAt: { type: Date, default: null },
    moderatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    moderatedAt: { type: Date, default: null },
    moderationNote: { type: String, maxlength: 300, default: '' },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);
commentSchema.index({ targetType: 1, targetId: 1, status: 1, createdAt: 1 });
commentSchema.index({ status: 1, createdAt: -1 });
commentSchema.index({ user: 1, createdAt: -1 });

// ---------------------------------------------------------------------------- Notification
const notificationSchema = new Schema(
  {
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true, maxlength: 60 },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, maxlength: 2000, default: '' },
    link: { type: String, maxlength: 300, default: '' },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);
notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });
// Keep a year of notifications.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 3600 });

// ---------------------------------------------------------------------------- Announcement
const announcementSchema = new Schema(
  {
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 5000 },
    audience: { type: String, enum: ['everyone', 'players', 'staff', 'team'], required: true },
    team: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipientCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);
announcementSchema.index({ audience: 1, createdAt: -1 });

// ---------------------------------------------------------------------------- Contact & newsletter
const contactMessageSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 120 },
    email: { type: String, required: true, maxlength: 254 },
    phone: { type: String, maxlength: 40, default: '' },
    subject: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 5000 },
    status: { type: String, enum: ['new', 'read', 'replied', 'archived', 'spam'], default: 'new' },
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    emailForwarded: { type: Boolean, default: false },
    handledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    handledAt: { type: Date, default: null },
  },
  { timestamps: true },
);
contactMessageSchema.index({ status: 1, createdAt: -1 });
// Contact messages are not kept forever (data minimisation): two years.
contactMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2 * 365 * 24 * 3600 });

const newsletterSubscriberSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    status: { type: String, enum: ['pending', 'subscribed', 'unsubscribed'], default: 'pending' },
    tokenHash: { type: String, select: false },
    confirmedAt: { type: Date, default: null },
    unsubscribedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
newsletterSubscriberSchema.index({ email: 1 }, { unique: true });
newsletterSubscriberSchema.index({ tokenHash: 1 });

export const News = mongoose.models.News || mongoose.model('News', newsSchema);
export const Video = mongoose.models.Video || mongoose.model('Video', videoSchema);
export const GalleryItem = mongoose.models.GalleryItem || mongoose.model('GalleryItem', galleryItemSchema);
export const Comment = mongoose.models.Comment || mongoose.model('Comment', commentSchema);
export const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
export const Announcement = mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);
export const ContactMessage = mongoose.models.ContactMessage || mongoose.model('ContactMessage', contactMessageSchema);
export const NewsletterSubscriber =
  mongoose.models.NewsletterSubscriber || mongoose.model('NewsletterSubscriber', newsletterSubscriberSchema);

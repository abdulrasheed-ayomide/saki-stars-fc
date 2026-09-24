import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id.');
export const optionalId = objectId.nullable().optional();
export const text = (max, { min = 0, label } = {}) =>
  min > 0 ? z.string().trim().min(min, label ? `Enter ${label}.` : 'This field is required.').max(max) : z.string().trim().max(max);
export const optionalText = (max) => z.string().trim().max(max).optional();
export const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https:\/\/[^\s<>"]+$/i.test(v), 'Enter a full https:// link.');
export const idParams = z.object({ id: objectId });
export const pagingQuery = {
  page: z.coerce.number().int().min(1).max(10000).optional(),
  // Each endpoint also caps the page size itself (getPaging maxLimit).
  limit: z.coerce.number().int().min(1).max(500).optional(),
};

/**
 * Media objects come back from our own /media/upload endpoint. The browser sends them
 * back when saving a record, so we check they really point at this club's Cloudinary
 * account and folder (no arbitrary external URLs).
 */
export function mediaInput(config) {
  const cloud = config.cloudinary.cloudName;
  const folder = config.cloudinary.folder;
  return z
    .object({
      publicId: z.string().max(300),
      url: z.string().max(1000),
      resourceType: z.enum(['image', 'video', 'raw']).optional().default('image'),
      deliveryType: z.enum(['upload', 'private', 'authenticated']).optional().default('upload'),
      format: z.string().max(20).optional(),
      width: z.number().int().positive().max(20000).optional().nullable(),
      height: z.number().int().positive().max(20000).optional().nullable(),
      bytes: z.number().int().nonnegative().optional().nullable(),
      duration: z.number().nonnegative().optional().nullable(),
      alt: z.string().trim().max(300).optional().default(''),
    })
    .refine(
      (m) => Boolean(cloud) && m.url.startsWith(`https://res.cloudinary.com/${cloud}/`) && m.publicId.startsWith(`${folder}/`),
      'This file was not uploaded through the club website.',
    )
    .nullable()
    .optional();
}

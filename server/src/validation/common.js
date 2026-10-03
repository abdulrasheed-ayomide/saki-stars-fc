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

// Pages on social networks / video sites: these show a post, not an image file, so they can
// never be used as an <img> source. (Direct image files on their CDNs are allowed.)
const PAGE_HOSTS = /(^|\.)(facebook\.com|fb\.com|fb\.watch|instagram\.com|tiktok\.com|twitter\.com|x\.com|youtube\.com|youtu\.be|threads\.net|linkedin\.com|drive\.google\.com|photos\.app\.goo\.gl|photos\.google\.com)$/i;

/**
 * Checks a link to an image hosted on another website. Returns a user-facing problem, or null
 * when the link is acceptable. The server never downloads the link (no SSRF); the browser
 * loads it directly, so only safe, absolute https URLs to real host names are accepted.
 */
export function externalImageProblem(value) {
  const v = String(value ?? '').trim();
  const generic = 'Paste a full image link starting with https://';
  if (!v) return generic;
  if (v.length > 1000) return 'This link is too long. Upload the image instead.';
  if (/[\s<>"'`\\]/.test(v)) return generic; // no HTML/iframe code or spaces
  let url;
  try {
    url = new URL(v);
  } catch {
    return generic;
  }
  if (url.protocol !== 'https:') return generic;
  if (url.username || url.password) return 'Remove the login details from the link.';
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost' || /^[\d.]+$/.test(host) || host.startsWith('[')) return generic;
  if (PAGE_HOSTS.test(host)) {
    return 'This is a link to a page or post, not to an image. Open the image itself and copy its address, or upload the image instead.';
  }
  return null;
}

export const externalImageUrl = z.string().trim().superRefine((v, ctx) => {
  const problem = externalImageProblem(v);
  if (problem) ctx.addIssue({ code: 'custom', message: problem });
});

/**
 * A media reference saved with a record. Two kinds:
 *  - source "cloudinary" (default, all existing data): a file returned by our own /media/upload
 *    endpoint. We check it really points at this club's Cloudinary account and folder.
 *  - source "link": an image hosted on another website (only the https URL is stored). Allowed
 *    for public image fields; `allowLink: false` keeps private/scouting files and video files
 *    upload-only.
 */
export function mediaInput(config, { allowLink = true } = {}) {
  const cloud = config.cloudinary.cloudName;
  const folder = config.cloudinary.folder;
  return z
    .object({
      source: z.enum(['cloudinary', 'link']).optional().default('cloudinary'),
      publicId: z.string().max(300).nullable().optional(),
      url: z.string().max(1000),
      resourceType: z.enum(['image', 'video', 'raw']).optional().default('image'),
      deliveryType: z.enum(['upload', 'private', 'authenticated']).optional().default('upload'),
      format: z.string().max(20).optional().nullable(),
      width: z.number().int().positive().max(20000).optional().nullable(),
      height: z.number().int().positive().max(20000).optional().nullable(),
      bytes: z.number().int().nonnegative().optional().nullable(),
      duration: z.number().nonnegative().optional().nullable(),
      alt: z.string().trim().max(300).optional().default(''),
    })
    .superRefine((m, ctx) => {
      if (m.source === 'link') {
        if (!allowLink) {
          ctx.addIssue({ code: 'custom', message: 'This file must be uploaded through the club website.' });
          return;
        }
        const problem = externalImageProblem(m.url);
        if (problem) ctx.addIssue({ code: 'custom', path: ['url'], message: problem });
        return;
      }
      const ok = Boolean(cloud) && Boolean(m.publicId) && m.url.startsWith(`https://res.cloudinary.com/${cloud}/`) && m.publicId.startsWith(`${folder}/`);
      if (!ok) ctx.addIssue({ code: 'custom', message: 'This file was not uploaded through the club website.' });
    })
    .transform((m) =>
      m.source === 'link'
        ? // Only what is needed to show the image; nothing else from the browser is kept.
          { source: 'link', url: m.url.trim(), alt: m.alt, resourceType: 'image', deliveryType: 'upload', width: m.width ?? null, height: m.height ?? null }
        : { ...m, source: 'cloudinary' },
    )
    .nullable()
    .optional();
}

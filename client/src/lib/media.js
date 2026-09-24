/**
 * Cloudinary delivery URLs with automatic format (WebP/AVIF), quality and width.
 * Only transforms Cloudinary "upload" URLs; anything else is returned unchanged.
 */
export function imageUrl(url, { width, height, crop = 'fill', gravity = 'auto' } = {}) {
  if (!url || !url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url;
  const parts = ['f_auto', 'q_auto'];
  if (width) parts.push(`w_${Math.round(width)}`);
  if (height) parts.push(`h_${Math.round(height)}`);
  if (width && height) parts.push(`c_${crop}`, `g_${gravity}`);
  else if (width) parts.push('c_limit');
  return url.replace('/upload/', `/upload/${parts.join(',')}/`);
}

export function srcSet(url, widths, opts = {}) {
  if (!url || !url.includes('res.cloudinary.com')) return undefined;
  return widths.map((w) => `${imageUrl(url, { ...opts, width: w, height: opts.aspect ? Math.round(w / opts.aspect) : undefined })} ${w}w`).join(', ');
}

export function videoPoster(url) {
  if (!url || !url.includes('res.cloudinary.com')) return undefined;
  return url.replace('/upload/', '/upload/so_1,f_jpg,w_960/').replace(/\.[a-z0-9]+$/i, '.jpg');
}

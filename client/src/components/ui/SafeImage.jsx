import { useState } from 'react';
import { ImageOff } from 'lucide-react';

/**
 * <img> that never shows the browser's broken-image icon. Images can now be links to other
 * websites, which may disappear at any time; when an image fails to load, `fallback` is shown
 * instead (nothing by default). Images from other websites are requested without our page
 * address (referrer) for visitors' privacy, which also avoids some hotlink blocks.
 */
export function SafeImage({ src, alt = '', fallback = null, onFail, ...props }) {
  const [failedSrc, setFailedSrc] = useState(null);
  if (!src || failedSrc === src) return fallback;
  const external = !src.includes('res.cloudinary.com');
  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy={external ? 'no-referrer' : undefined}
      onError={() => {
        setFailedSrc(src);
        onFail?.();
      }}
      {...props}
    />
  );
}

/** Neutral placeholder for a photo that could not be loaded. */
export function ImageUnavailable({ className = '', label = 'Image unavailable' }) {
  return (
    <div role="img" aria-label={label} className={`grid place-items-center bg-slate-100 text-slate-400 ${className}`}>
      <ImageOff aria-hidden="true" className="size-8" />
    </div>
  );
}

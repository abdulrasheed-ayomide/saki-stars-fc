import { useState } from 'react';
import { Shield } from 'lucide-react';
import { imageUrl } from '../../lib/media.js';
import { initials } from '../../lib/format.js';

const SIZES = { sm: 'size-7 text-[10px]', md: 'size-10 text-xs', lg: 'size-14 text-sm', xl: 'size-20 text-base' };
const ICON = { sm: 'size-3.5', md: 'size-5', lg: 'size-7', xl: 'size-10' };
const PX = { sm: 28, md: 40, lg: 56, xl: 80 };

/**
 * Team crest. Falls back to a neutral badge (initials, or a shield icon when the team has
 * no name) when no logo was uploaded OR the image fails to load, so a broken image or "?"
 * box is never shown.
 */
export function TeamLogo({ team, size = 'md', className = '' }) {
  const logo = team?.logo?.url;
  const [failedUrl, setFailedUrl] = useState(null);
  const name = team?.shortName || team?.name || '';

  if (logo && failedUrl !== logo) {
    return (
      <img
        src={imageUrl(logo, { width: PX[size] * 2, height: PX[size] * 2, crop: 'pad' })}
        alt=""
        loading="lazy"
        width={PX[size]}
        height={PX[size]}
        onError={() => setFailedUrl(logo)}
        className={`${SIZES[size]} shrink-0 object-contain ${className}`}
      />
    );
  }
  const letters = initials(name);
  return (
    <span
      role="img"
      aria-label={name ? `${name} (team logo unavailable)` : 'Team logo unavailable'}
      title={name || 'Team logo unavailable'}
      className={`grid ${SIZES[size]} shrink-0 place-items-center rounded-full bg-brand-100 font-bold text-brand-800 ${className}`}
    >
      {letters ? <span aria-hidden="true">{letters}</span> : <Shield aria-hidden="true" className={ICON[size]} />}
    </span>
  );
}

export function CompetitionLogo({ competition, className = 'size-5' }) {
  const url = competition?.logo?.url;
  const [failedUrl, setFailedUrl] = useState(null);
  if (!url || failedUrl === url) return null;
  return (
    <img
      src={imageUrl(url, { width: 48, height: 48, crop: 'pad' })}
      alt=""
      loading="lazy"
      onError={() => setFailedUrl(url)}
      className={`${className} shrink-0 object-contain`}
    />
  );
}

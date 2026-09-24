import { imageUrl } from '../../lib/media.js';
import { initials } from '../../lib/format.js';

const SIZES = { sm: 'size-7 text-[10px]', md: 'size-10 text-xs', lg: 'size-14 text-sm', xl: 'size-20 text-base' };
const PX = { sm: 28, md: 40, lg: 56, xl: 80 };

/** Team crest, or a neutral initials badge when no logo has been uploaded. */
export function TeamLogo({ team, size = 'md', className = '' }) {
  const logo = team?.logo?.url;
  if (logo) {
    return (
      <img
        src={imageUrl(logo, { width: PX[size] * 2, height: PX[size] * 2, crop: 'pad' })}
        alt=""
        loading="lazy"
        width={PX[size]}
        height={PX[size]}
        className={`${SIZES[size]} shrink-0 object-contain ${className}`}
      />
    );
  }
  return (
    <span aria-hidden="true" className={`grid ${SIZES[size]} shrink-0 place-items-center rounded-full bg-brand-100 font-bold text-brand-800 ${className}`}>
      {initials(team?.shortName || team?.name || '?')}
    </span>
  );
}

export function CompetitionLogo({ competition, className = 'size-5' }) {
  if (!competition?.logo?.url) return null;
  return <img src={imageUrl(competition.logo.url, { width: 48, height: 48, crop: 'pad' })} alt="" loading="lazy" className={`${className} shrink-0 object-contain`} />;
}

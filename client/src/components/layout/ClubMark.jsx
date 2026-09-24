import { Link } from 'react-router';
import { useSettings } from '../../app/SettingsProvider.jsx';
import { imageUrl } from '../../lib/media.js';
import { initials } from '../../lib/format.js';

/** Club crest (from Settings) with the short name; initials badge until a crest is uploaded. */
export function ClubMark({ className = '' }) {
  const { settings } = useSettings();
  return (
    <Link to="/" className={`flex min-h-11 min-w-0 items-center gap-2 rounded-md text-white no-underline ${className}`} aria-label={`${settings.name} home`}>
      {settings.logo?.url ? (
        <img src={imageUrl(settings.logo.url, { width: 72, height: 72, crop: 'pad' })} alt="" className="size-9 shrink-0 object-contain" />
      ) : (
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-white/80 text-xs font-bold tracking-wide">
          {initials(settings.shortName)}
        </span>
      )}
      <span className="min-w-0 truncate text-sm font-semibold xs:text-base">{settings.shortName}</span>
    </Link>
  );
}

import { Link } from 'react-router';
import { User } from 'lucide-react';
import { imageUrl } from '../../lib/media.js';

export function PlayerPhoto({ player, className = '', width = 320 }) {
  if (player?.photo?.url) {
    return (
      <img
        src={imageUrl(player.photo.url, { width, height: Math.round(width * 1.25) })}
        alt={player.photo.alt || player.name}
        loading="lazy"
        className={`object-cover object-top ${className}`}
      />
    );
  }
  return (
    <div className={`grid place-items-center bg-gradient-to-b from-brand-100 to-brand-200 text-brand-700 ${className}`}>
      <User aria-hidden="true" className="size-1/3" />
    </div>
  );
}

/** Public player card: photo, number, name, position. Never private data. */
export function PlayerCard({ player }) {
  return (
    <Link to={`/players/${player.slug}`} className="group block overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm hover:border-brand-300 hover:shadow">
      <div className="relative">
        <PlayerPhoto player={player} className="aspect-[4/5] w-full" />
        {player.jerseyNumber != null && (
          <span className="absolute left-2 top-2 rounded bg-brand-900/90 px-2 py-0.5 text-lg font-bold text-white tabular-nums">{player.jerseyNumber}</span>
        )}
      </div>
      <div className="p-3">
        <p className="font-semibold text-brand-900 group-hover:underline">{player.name}</p>
        <p className="text-sm text-slate-600">
          {player.position}
          {player.nationality ? ` · ${player.nationality}` : ''}
        </p>
      </div>
    </Link>
  );
}

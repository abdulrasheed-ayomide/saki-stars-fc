import { useState } from 'react';
import { Images, PlayCircle, Clapperboard } from 'lucide-react';
import { useApi } from '../../hooks/useApi.js';
import { Modal } from '../ui/Modal.jsx';
import { ErrorState, Skeleton } from '../ui/Feedback.jsx';
import { Lightbox } from '../content/Lightbox.jsx';
import { VideoPlayer } from '../content/VideoCard.jsx';

const MAX_PHOTOS = 100;

/** True when at least one kind of match media has been published. */
export function hasMatchMedia(match) {
  const m = match?.media;
  return Boolean(m && (m.fullMatch || m.highlights || m.photoCount > 0));
}

function ActionLink({ icon: Icon, children, onClick, tone }) {
  const cls =
    tone === 'dark'
      ? 'text-brand-100 hover:text-white'
      : 'text-brand-700 hover:text-brand-900';
  return (
    <button type="button" onClick={onClick} className={`inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold hover:underline ${cls}`}>
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {children}
    </button>
  );
}

function MatchPhotos({ match, onClose }) {
  const state = useApi(`/gallery?match=${match.id}&limit=${MAX_PHOTOS}`);
  const [index, setIndex] = useState(0);
  const items = state.data?.items || [];
  const title = `Pictures: ${match.homeTeam?.name} v ${match.awayTeam?.name}`;
  if (items.length) return <Lightbox items={items} index={index} onIndex={setIndex} onClose={onClose} />;
  return (
    <Modal open onClose={onClose} title={title} size="lg">
      {state.error ? (
        <ErrorState error={state.error} onRetry={state.reload} context="gallery" />
      ) : state.loading || !state.data ? (
        <Skeleton className="aspect-video w-full" />
      ) : (
        <p className="text-sm text-slate-600">No pictures have been published for this match.</p>
      )}
    </Modal>
  );
}

/**
 * "Watch Full Match", "View Pictures" and "Watch Highlights" for one match. Each action only
 * appears when that media has actually been published (the API sends `media` with what is live),
 * so a visitor never meets a dead link.
 */
export function MatchMediaActions({ match, tone = 'light', align = 'start', className = '' }) {
  const [open, setOpen] = useState(null); // 'full' | 'highlights' | 'photos'
  if (!hasMatchMedia(match)) return null;
  const { fullMatch, highlights, photoCount } = match.media;
  const fixture = `${match.homeTeam?.name} v ${match.awayTeam?.name}`;
  const video = open === 'full' ? fullMatch : open === 'highlights' ? highlights : null;
  return (
    <div className={className}>
      <ul aria-label={`Match media: ${fixture}`} className={`flex flex-wrap items-center gap-x-4 gap-y-0 ${align === 'center' ? 'justify-center' : ''}`}>
        {fullMatch && (
          <li>
            <ActionLink icon={PlayCircle} tone={tone} onClick={() => setOpen('full')}>
              Watch Full Match
            </ActionLink>
          </li>
        )}
        {photoCount > 0 && (
          <li>
            <ActionLink icon={Images} tone={tone} onClick={() => setOpen('photos')}>
              View Pictures<span className="sr-only"> ({photoCount})</span>
            </ActionLink>
          </li>
        )}
        {highlights && (
          <li>
            <ActionLink icon={Clapperboard} tone={tone} onClick={() => setOpen('highlights')}>
              Watch Highlights
            </ActionLink>
          </li>
        )}
      </ul>
      {video && (
        <Modal open onClose={() => setOpen(null)} title={`${open === 'full' ? 'Full match' : 'Highlights'}: ${fixture}`} size="xl">
          <VideoPlayer video={video} externalLink />
        </Modal>
      )}
      {open === 'photos' && <MatchPhotos match={match} onClose={() => setOpen(null)} />}
    </div>
  );
}

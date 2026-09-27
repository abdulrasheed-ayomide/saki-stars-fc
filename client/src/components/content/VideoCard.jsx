import { useState } from 'react';
import { PlayCircle, VideoOff } from 'lucide-react';
import { imageUrl } from '../../lib/media.js';

export function videoThumb(video) {
  if (video.thumbnailUrl) return video.thumbnailUrl.includes('res.cloudinary.com') ? imageUrl(video.thumbnailUrl, { width: 640, height: 360 }) : video.thumbnailUrl;
  return null;
}

export function VideoCard({ video, onPlay }) {
  const thumb = videoThumb(video);
  return (
    <button type="button" onClick={() => onPlay(video)} className="group block w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-sm hover:border-brand-300 hover:shadow">
      <div className="relative aspect-video bg-brand-950">
        {thumb && <img src={thumb} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-90" />}
        <span className="absolute inset-0 grid place-items-center">
          <PlayCircle aria-hidden="true" className="size-14 text-white drop-shadow-lg transition group-hover:scale-105" />
        </span>
      </div>
      <div className="p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{video.category}</p>
        <p className="mt-1 line-clamp-2 font-semibold text-brand-900">{video.title}</p>
      </div>
    </button>
  );
}

/** Plays YouTube (privacy-enhanced embed) or a Cloudinary-hosted file. */
export function VideoPlayer({ video }) {
  if (video.source === 'youtube' && video.youtubeId) {
    return (
      <div className="relative aspect-video overflow-hidden rounded-md bg-black">
        <iframe
          className="absolute inset-0 size-full"
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.youtubeId)}?rel=0&modestbranding=1`}
          title={video.title}
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }
  if (video.media?.url) {
    return (
      <video className="aspect-video w-full rounded-md bg-black" controls preload="metadata" poster={video.thumbnailUrl || undefined}>
        <source src={video.media.url} />
        Your browser cannot play this video.
      </video>
    );
  }
  return <p className="text-sm text-slate-600">This video is not available.</p>;
}

/**
 * YouTube video from a stored video ID only (never stored iframe HTML). Shows the thumbnail
 * first and loads the privacy-enhanced player when tapped. If YouTube no longer has the video
 * (removed, private, account closed), its thumbnail is missing or is YouTube's 120px
 * placeholder, and a plain "Video temporarily unavailable." is shown instead of provider errors.
 */
export function YouTubeEmbed({ videoId, title = 'Video' }) {
  const [state, setState] = useState('ready'); // ready | playing | unavailable
  const id = /^[A-Za-z0-9_-]{11}$/.test(videoId || '') ? videoId : null;

  if (!id || state === 'unavailable') {
    return (
      <div role="status" className="grid aspect-video place-items-center rounded-lg bg-slate-100 px-4 text-center text-slate-600">
        <span>
          <VideoOff aria-hidden="true" className="mx-auto size-8 text-slate-400" />
          <span className="mt-2 block text-sm font-medium">Video temporarily unavailable.</span>
        </span>
      </div>
    );
  }
  if (state === 'playing') {
    return (
      <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
        <iframe
          className="absolute inset-0 size-full"
          src={`https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&autoplay=1`}
          title={title}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setState('playing')} className="group relative block aspect-video w-full overflow-hidden rounded-lg bg-brand-950" aria-label={`Play video: ${title}`}>
      <img
        src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
        alt=""
        loading="lazy"
        className="absolute inset-0 size-full object-cover opacity-90"
        onError={() => setState('unavailable')}
        onLoad={(e) => {
          if (e.currentTarget.naturalWidth === 120) setState('unavailable');
        }}
      />
      <span className="absolute inset-0 grid place-items-center">
        <PlayCircle aria-hidden="true" className="size-16 text-white drop-shadow-lg transition group-hover:scale-105" />
      </span>
    </button>
  );
}

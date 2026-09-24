import { Link } from 'react-router';
import { Newspaper } from 'lucide-react';
import { imageUrl, srcSet } from '../../lib/media.js';
import { formatDate } from '../../lib/format.js';
import { useSettings } from '../../app/SettingsProvider.jsx';

export function NewsCard({ article, featured = false }) {
  const { settings } = useSettings();
  const img = article.featuredImage?.url;
  return (
    <Link to={`/news/${article.slug}`} className={`group flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm hover:border-brand-300 hover:shadow ${featured ? 'md:flex-row' : ''}`}>
      <div className={`relative bg-brand-100 ${featured ? 'aspect-video md:aspect-auto md:w-3/5' : 'aspect-video'}`}>
        {img ? (
          <img
            src={imageUrl(img, { width: 640, height: 360 })}
            srcSet={srcSet(img, [400, 640, 960], { aspect: 16 / 9 })}
            sizes={featured ? '(min-width: 768px) 60vw, 100vw' : '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw'}
            alt={article.featuredImage.alt || ''}
            loading="lazy"
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-brand-300">
            <Newspaper aria-hidden="true" className="size-10" />
          </div>
        )}
      </div>
      <div className={`flex min-w-0 flex-1 flex-col p-4 ${featured ? 'md:justify-center md:p-6' : ''}`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{article.category}</p>
        <h3 className={`mt-1 font-bold text-brand-900 group-hover:underline ${featured ? 'text-xl md:text-2xl' : 'text-base'}`}>{article.title}</h3>
        {article.excerpt && <p className={`mt-2 text-sm text-slate-600 ${featured ? 'line-clamp-4' : 'line-clamp-3'}`}>{article.excerpt}</p>}
        <p className="mt-auto pt-3 text-xs text-slate-500">
          <time dateTime={article.publishedAt}>{formatDate(article.publishedAt, settings.timezone)}</time>
        </p>
      </div>
    </Link>
  );
}

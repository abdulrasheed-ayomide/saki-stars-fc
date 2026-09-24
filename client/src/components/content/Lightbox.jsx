import { useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Modal } from '../ui/Modal.jsx';
import { imageUrl } from '../../lib/media.js';
import { formatDate } from '../../lib/format.js';

/** Full-size image viewer with previous/next (arrow keys work too). */
export function Lightbox({ items, index, onClose, onIndex }) {
  const item = index != null ? items[index] : null;
  useEffect(() => {
    if (index == null) return undefined;
    function onKey(e) {
      if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, items.length, onIndex]);

  return (
    <Modal open={Boolean(item)} onClose={onClose} title={item?.title || item?.category || 'Photo'} size="xl">
      {item && (
        <div>
          <div className="relative grid place-items-center bg-slate-950">
            <img src={imageUrl(item.image.url, { width: 1600 })} alt={item.image.alt || item.caption || item.title || 'Club photo'} className="max-h-[70vh] w-auto object-contain" />
          </div>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 text-sm text-slate-700">
              {item.caption && <p>{item.caption}</p>}
              <p className="mt-1 text-xs text-slate-500">
                {[item.category, item.takenAt && formatDate(item.takenAt), item.photographer && `Photo: ${item.photographer}`].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => onIndex(index - 1)} disabled={index === 0} aria-label="Previous photo" className="grid size-11 place-items-center rounded-md border border-slate-300 disabled:opacity-40">
                <ChevronLeft aria-hidden="true" className="size-5" />
              </button>
              <button type="button" onClick={() => onIndex(index + 1)} disabled={index >= items.length - 1} aria-label="Next photo" className="grid size-11 place-items-center rounded-md border border-slate-300 disabled:opacity-40">
                <ChevronRight aria-hidden="true" className="size-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

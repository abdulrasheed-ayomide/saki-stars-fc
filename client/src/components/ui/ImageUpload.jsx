import { useRef, useState } from 'react';
import { ImagePlus, Trash2, Upload } from 'lucide-react';
import { uploadFile } from '../../services/apiClient.js';
import { imageUrl } from '../../lib/media.js';
import { Button } from './Button.jsx';

/**
 * Uploads an image (or video) through the API to Cloudinary and returns the media
 * object to store with the record. The Cloudinary secret never reaches the browser.
 */
export function MediaUpload({ value, onChange, folder, kind = 'image', label = 'Image', hint, aspect = 'aspect-video', accept }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const types = accept || (kind === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/jpeg,image/png,image/webp,image/gif');

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const media = await uploadFile(`/media/upload?folder=${folder}&kind=${kind}`, file, { alt: value?.alt || '' });
      onChange({ ...media, alt: value?.alt || '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0">
      <p className="mb-1 text-sm font-medium text-slate-800">{label}</p>
      <div className={`relative overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-50 ${aspect} max-w-sm`}>
        {value?.url ? (
          kind === 'video' ? (
            <video src={value.url} controls className="size-full bg-black object-contain" />
          ) : (
            <img src={imageUrl(value.url, { width: 640 })} alt={value.alt || ''} className="size-full object-cover" />
          )
        ) : (
          <div className="grid size-full place-items-center text-slate-400">
            <ImagePlus aria-hidden="true" className="size-8" />
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" icon={Upload} loading={busy} onClick={() => input.current?.click()}>
          {value?.url ? 'Replace' : 'Upload'}
        </Button>
        {value?.url && (
          <Button variant="ghost" size="sm" icon={Trash2} onClick={() => onChange(null)}>
            Remove
          </Button>
        )}
        <input ref={input} type="file" accept={types} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onFile} />
      </div>
      {value?.url && kind === 'image' && (
        <label className="mt-2 block text-sm">
          <span className="text-slate-700">Description for screen readers (alt text)</span>
          <input
            className="mt-1 block min-h-11 w-full rounded-md border border-slate-300 px-3"
            value={value.alt || ''}
            maxLength={300}
            onChange={(e) => onChange({ ...value, alt: e.target.value })}
          />
        </label>
      )}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}

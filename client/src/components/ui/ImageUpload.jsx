import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Link2, Trash2, Upload } from 'lucide-react';
import { uploadFile } from '../../services/apiClient.js';
import { imageUrl } from '../../lib/media.js';
import { Button } from './Button.jsx';
import { SafeImage, ImageUnavailable } from './SafeImage.jsx';
import { userMessage, logError } from '../../lib/errors.js';

const LOAD_FAILED = 'Unable to load this image. Please check the link or upload the image instead.';
const NOT_AN_IMAGE = 'This is a link to a page or post, not to an image. Open the image itself and copy its address, or upload the image instead.';
const NEEDS_HTTPS = 'Paste a full image link starting with https://';
// Pages, not image files (same list as the server).
const PAGE_HOSTS = /(^|\.)(facebook\.com|fb\.com|fb\.watch|instagram\.com|tiktok\.com|twitter\.com|x\.com|youtube\.com|youtu\.be|threads\.net|linkedin\.com|drive\.google\.com|photos\.app\.goo\.gl|photos\.google\.com)$/i;
// Direct image files on these hosts work, but the links carry an expiry date.
const EXPIRING_HOSTS = /(^|\.)(fbcdn\.net|cdninstagram\.com|fbsbx\.com|whatsapp\.net)$/i;

/** Mirrors the server check so people see problems straight away (the server still decides). */
export function linkProblem(value) {
  const v = value.trim();
  if (!v) return null;
  if (v.length > 1000) return 'This link is too long. Upload the image instead.';
  if (/[\s<>"'`\\]/.test(v)) return NEEDS_HTTPS;
  let url;
  try {
    url = new URL(v);
  } catch {
    return NEEDS_HTTPS;
  }
  if (url.protocol !== 'https:') return NEEDS_HTTPS;
  if (url.username || url.password) return 'Remove the login details from the link.';
  if (!url.hostname.includes('.')) return NEEDS_HTTPS;
  if (PAGE_HOSTS.test(url.hostname)) return NOT_AN_IMAGE;
  return null;
}

function isExpiringHost(value) {
  try {
    return EXPIRING_HOSTS.test(new URL(value).hostname);
  } catch {
    return false;
  }
}

/**
 * Image (or video) field for any record. Two ways to add an image:
 *   - Paste link: an https image address from another website. Only the link is saved; the
 *     image is checked by loading it in the browser before it is used (live preview).
 *   - Upload: the file goes through the API to Cloudinary (the secret never reaches the browser).
 * Video fields (kind="video") stay upload-only; YouTube links are added in the video form.
 */
export function MediaUpload({ value, onChange, folder, kind = 'image', label = 'Image', hint, aspect = 'aspect-video', accept }) {
  const input = useRef(null);
  const allowLink = kind === 'image';
  const [mode, setMode] = useState(allowLink && (value?.source === 'link' || !value?.url) ? 'link' : 'upload');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(value?.source === 'link' ? value.url : '');
  const [check, setCheck] = useState({ url: '', state: 'idle' }); // idle | checking | failed
  const types = accept || (kind === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/jpeg,image/png,image/webp,image/gif');

  // Check a pasted link shortly after typing stops.
  const draftProblem = linkProblem(draft);
  const candidate = draft.trim() && !draftProblem && draft.trim() !== value?.url ? draft.trim() : '';
  useEffect(() => {
    if (!candidate) return undefined;
    const t = setTimeout(() => setCheck({ url: candidate, state: 'checking' }), 400);
    return () => clearTimeout(t);
  }, [candidate]);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const media = await uploadFile(`/media/upload?folder=${folder}&kind=${kind}`, file, { alt: value?.alt || '' });
      onChange({ ...media, source: 'cloudinary', alt: value?.alt || '' });
      setDraft('');
    } catch (err) {
      setError(userMessage(err, 'upload'));
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    onChange(null);
    setDraft('');
    setCheck({ url: '', state: 'idle' });
  }

  const linkMessage = draft.trim() ? draftProblem || (check.url === draft.trim() && check.state === 'failed' ? LOAD_FAILED : null) : null;
  const tabClass = (on) =>
    `inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded px-3 text-sm font-medium ${on ? 'bg-white text-brand-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`;

  return (
    <div className="min-w-0">
      <p className="mb-1 text-sm font-medium text-slate-800">{label}</p>
      {allowLink && (
        <div role="group" aria-label={`${label}: choose how to add it`} className="mb-2 flex max-w-sm gap-1 rounded-md bg-slate-100 p-1">
          <button type="button" aria-pressed={mode === 'link'} className={tabClass(mode === 'link')} onClick={() => setMode('link')}>
            <Link2 aria-hidden="true" className="size-4" /> Paste link
          </button>
          <button type="button" aria-pressed={mode === 'upload'} className={tabClass(mode === 'upload')} onClick={() => setMode('upload')}>
            <Upload aria-hidden="true" className="size-4" /> Upload
          </button>
        </div>
      )}

      <div className={`relative overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-50 ${aspect} max-w-sm`}>
        {value?.url ? (
          kind === 'video' ? (
            <video src={value.url} controls className="size-full bg-black object-contain" />
          ) : (
            <SafeImage src={imageUrl(value.url, { width: 640 })} alt={value.alt || ''} className="size-full object-cover" fallback={<ImageUnavailable className="size-full" />} />
          )
        ) : (
          <div className="grid size-full place-items-center text-slate-400">
            <ImagePlus aria-hidden="true" className="size-8" />
          </div>
        )}
      </div>

      {mode === 'link' && allowLink ? (
        <div className="mt-2 max-w-sm">
          <label className="block text-sm">
            <span className="text-slate-700">Image link (https://…)</span>
            <input
              type="url"
              inputMode="url"
              className="mt-1 block min-h-11 w-full min-w-0 rounded-md border border-slate-300 px-3 text-sm"
              value={draft}
              maxLength={1000}
              placeholder="https://"
              aria-invalid={Boolean(linkMessage) || undefined}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
            />
          </label>
          {check.state === 'checking' && check.url === candidate && (
            // Hidden test load: the link is only used once the browser can actually show it.
            <img
              src={check.url}
              alt=""
              hidden
              referrerPolicy="no-referrer"
              onLoad={(e) => {
                const { naturalWidth: width, naturalHeight: height } = e.currentTarget;
                onChange({ source: 'link', url: check.url, alt: value?.alt || '', width: width || null, height: height || null });
                setCheck({ url: check.url, state: 'idle' });
              }}
              onError={() => {
                logError({ kind: 'client', developerMessage: `Image link failed to load: ${check.url}` }, 'media link');
                setCheck({ url: check.url, state: 'failed' });
              }}
            />
          )}
          {check.state === 'checking' && check.url === candidate && <p className="mt-1 text-xs text-slate-500">Checking the image…</p>}
          {linkMessage && (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {linkMessage}
            </p>
          )}
          {!linkMessage && isExpiringHost(draft) && (
            <p className="mt-1 text-xs text-amber-800">Facebook and Instagram image links usually stop working after a few weeks. For a permanent image, upload it instead.</p>
          )}
          {!draft && <p className="mt-1 text-xs text-slate-500">Right-click (or long-press) the image on the other website, choose “Copy image address”, and paste it here.</p>}
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" icon={Upload} loading={busy} onClick={() => input.current?.click()}>
            {value?.url ? 'Replace' : allowLink ? 'Choose file' : 'Upload'}
          </Button>
          <input ref={input} type="file" accept={types} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onFile} />
        </div>
      )}

      {value?.url && (
        <div className="mt-2">
          <Button variant="ghost" size="sm" icon={Trash2} onClick={remove}>
            {kind === 'video' ? 'Remove video' : 'Remove image'}
          </Button>
        </div>
      )}
      {value?.url && kind === 'image' && (
        <label className="mt-2 block max-w-sm text-sm">
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

import { useRef, useState } from 'react';
import { Clapperboard, Images, Link2, Pencil, PlayCircle, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useApi } from '../../hooks/useApi.js';
import { apiRequest, uploadFile } from '../../services/apiClient.js';
import { AsyncContent, Alert } from '../../components/ui/Feedback.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Field, Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { ConfirmDialog, Modal } from '../../components/ui/Modal.jsx';
import { FormError } from '../../components/ui/FormError.jsx';
import { useForm } from '../../components/ui/useForm.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { MediaUpload, linkProblem } from '../../components/ui/ImageUpload.jsx';
import { SafeImage, ImageUnavailable } from '../../components/ui/SafeImage.jsx';
import { VideoPlayer, videoThumb } from '../../components/content/VideoCard.jsx';
import { imageUrl } from '../../lib/media.js';
import { userMessage } from '../../lib/errors.js';

const SLOTS = [
  {
    kind: 'full-match',
    key: 'fullMatch',
    title: 'Full match video',
    icon: PlayCircle,
    description: 'The whole match. Shown on the website as “Watch Full Match”.',
  },
  {
    kind: 'highlights',
    key: 'highlights',
    title: 'Match highlights',
    icon: Clapperboard,
    description: 'A short highlights video. Shown on the website as “Watch Highlights”.',
  },
];

/**
 * Staff tab for one match's media: full match video, highlights and pictures. Videos are a YouTube
 * link or an uploaded file (stored in the video library and linked to this match); pictures are
 * uploaded (or linked) and saved as gallery photos of this match. Everything is published straight
 * away, and the public match pages pick it up on their next load.
 */
export function MatchMediaManager({ match }) {
  const state = useApi(`/admin/matches/${match.id}/media`);
  return (
    <AsyncContent state={state} context="media">
      {(data) => (
        <div className="space-y-4">
          {SLOTS.map((slot) => (
            <VideoSlot key={slot.kind} match={match} slot={slot} current={data[slot.key]} canUseLibrary={data.canUseLibrary} onChanged={state.reload} />
          ))}
          <MatchPhotos match={match} photos={data.photos} onChanged={state.reload} />
        </div>
      )}
    </AsyncContent>
  );
}

function VideoSlot({ match, slot, current, canUseLibrary, onChanged }) {
  const { notify } = useToast();
  const [editing, setEditing] = useState(!current);
  const [confirm, setConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [preview, setPreview] = useState(false);
  const live = current?.status === 'published';

  async function remove() {
    setRemoving(true);
    try {
      await apiRequest(`/admin/matches/${match.id}/media/${slot.kind}`, { method: 'DELETE' });
      notify(`${slot.title} removed from this match.`);
      setConfirm(false);
      setEditing(true);
      onChanged();
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    } finally {
      setRemoving(false);
    }
  }

  const thumb = current && videoThumb(current);
  return (
    <Card>
      <CardHeader title={slot.title} description={slot.description} />
      <div className="space-y-4 p-4">
        {current && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <button
              type="button"
              onClick={() => setPreview(true)}
              className="relative aspect-video w-full shrink-0 overflow-hidden rounded-md bg-brand-950 sm:w-48"
              aria-label={`Play ${current.title}`}
            >
              {thumb && <img src={thumb} alt="" className="absolute inset-0 size-full object-cover opacity-90" />}
              <span className="absolute inset-0 grid place-items-center">
                <slot.icon aria-hidden="true" className="size-10 text-white drop-shadow" />
              </span>
            </button>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="break-words font-semibold text-slate-900">{current.title}</p>
              <p className="flex flex-wrap gap-2 text-sm text-slate-600">
                <Badge tone="brand">{current.source === 'youtube' ? 'YouTube' : 'Uploaded file'}</Badge>
                {live ? <Badge tone="success">On the website</Badge> : <Badge tone="warning">Not published: hidden from visitors</Badge>}
              </p>
              {!live && <p className="text-sm text-slate-600">Publish it under Videos (media staff) for visitors to see it.</p>}
              <div className="flex flex-wrap gap-2">
                {!editing && (
                  <Button variant="outline" icon={RefreshCw} onClick={() => setEditing(true)}>
                    Replace
                  </Button>
                )}
                <Button variant="danger-outline" icon={Trash2} onClick={() => setConfirm(true)}>
                  Remove
                </Button>
              </div>
            </div>
          </div>
        )}
        {editing && (
          <VideoForm
            match={match}
            slot={slot}
            current={current}
            canUseLibrary={canUseLibrary}
            onCancel={current ? () => setEditing(false) : null}
            onSaved={() => {
              setEditing(false);
              onChanged();
            }}
          />
        )}
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={remove} loading={removing} title={`Remove the ${slot.title.toLowerCase()}?`} confirmLabel="Remove">
        The link disappears from the website for this match. The video itself stays in the Videos library (media staff can delete it there).
      </ConfirmDialog>
      {preview && current && (
        <Modal open onClose={() => setPreview(false)} title={current.title} size="xl">
          <VideoPlayer video={current} externalLink />
        </Modal>
      )}
    </Card>
  );
}

function VideoForm({ match, slot, current, canUseLibrary, onCancel, onSaved }) {
  const { notify } = useToast();
  const library = useApi(canUseLibrary ? '/admin/videos?limit=100' : null);
  const form = useForm({ source: 'youtube', youtubeUrl: '', media: null, video: '', title: '' });
  const { values: v, set, errors: e } = form;
  const onSubmit = form.submit(async (values) => {
    const body =
      values.source === 'library'
        ? { video: values.video || undefined }
        : { source: values.source, youtubeUrl: values.youtubeUrl, media: values.source === 'cloudinary' ? values.media : null, title: values.title };
    if (values.source === 'library' && !values.video) {
      throw Object.assign(new Error('Choose a video.'), { code: 'VALIDATION_ERROR', details: [{ path: 'video', message: 'Choose a video from the library.' }] });
    }
    await apiRequest(`/admin/matches/${match.id}/media/${slot.kind}`, { method: 'PUT', body });
    notify(`${slot.title} saved. It is now on the website.`);
    onSaved();
  });
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4">
      <FormError error={form.formError} context="media" />
      <Field label={current ? 'Replace with' : 'Add from'} error={e.source}>
        <Select value={v.source} onChange={set('source')}>
          <option value="youtube">A YouTube link</option>
          <option value="cloudinary">An uploaded video file</option>
          {canUseLibrary && <option value="library">A video already in the Videos library</option>}
        </Select>
      </Field>
      {v.source === 'youtube' && (
        <Field label="YouTube link" required error={e.youtubeUrl} hint="Paste the address of the video, e.g. https://youtu.be/… or https://www.youtube.com/watch?v=…">
          <Input value={v.youtubeUrl} onChange={set('youtubeUrl')} maxLength={300} inputMode="url" />
        </Field>
      )}
      {v.source === 'cloudinary' && (
        <div>
          <MediaUpload label="Video file" kind="video" folder="matches" value={v.media} onChange={set('media')} hint="MP4, WebM or MOV. Full matches are usually too long to upload: use YouTube for those." />
          {e.media && <p className="mt-1 text-sm text-red-700">{e.media}</p>}
        </div>
      )}
      {v.source === 'library' && (
        <Field label="Video" required error={e.video}>
          <Select value={v.video} onChange={set('video')}>
            <option value="">Choose a video…</option>
            {(library.data?.items || []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
                {item.status !== 'published' ? ` (${item.status})` : ''}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {v.source !== 'library' && (
        <Field label="Title (optional)" error={e.title} hint={`Leave empty for “${match.homeTeam?.name} v ${match.awayTeam?.name}: ${slot.kind === 'full-match' ? 'Full match' : 'Highlights'}”.`}>
          <Input value={v.title} onChange={set('title')} maxLength={200} />
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={form.submitting}>
          {current ? 'Save replacement' : 'Save'}
        </Button>
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

const MAX_PER_BATCH = 30;

function MatchPhotos({ match, photos, onChanged }) {
  const { notify } = useToast();
  const input = useRef(null);
  const [progress, setProgress] = useState(null); // { done, total }
  const [failures, setFailures] = useState([]);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState(null);
  const [addingLink, setAddingLink] = useState(false);
  const [remove, setRemove] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [edit, setEdit] = useState(null);

  async function addImages(images) {
    await apiRequest(`/admin/matches/${match.id}/photos`, { method: 'POST', body: { images } });
    onChanged();
  }

  async function onFiles(e) {
    const files = [...(e.target.files || [])].slice(0, MAX_PER_BATCH);
    e.target.value = '';
    if (!files.length) return;
    const uploaded = [];
    const failed = [];
    setFailures([]);
    for (let i = 0; i < files.length; i += 1) {
      setProgress({ done: i, total: files.length });
      try {
        const file = await uploadFile('/media/upload?folder=matches&kind=image', files[i]);
        uploaded.push({ ...file, source: 'cloudinary', alt: '' });
      } catch (err) {
        failed.push({ name: files[i].name, message: userMessage(err, 'upload') });
      }
    }
    try {
      if (uploaded.length) {
        await addImages(uploaded);
        notify(`${uploaded.length} photo${uploaded.length === 1 ? '' : 's'} added to this match.`);
      }
    } catch (err) {
      failed.push({ name: 'Saving the photos', message: userMessage(err, 'save') });
    } finally {
      setProgress(null);
      setFailures(failed);
    }
  }

  async function onAddLink() {
    const problem = linkProblem(link) || (!link.trim() ? 'Paste a full image link starting with https://' : null);
    setLinkError(problem);
    if (problem) return;
    setAddingLink(true);
    try {
      await addImages([{ source: 'link', url: link.trim(), resourceType: 'image', alt: '' }]);
      setLink('');
      notify('Photo added to this match.');
    } catch (err) {
      setLinkError(userMessage(err, 'save'));
    } finally {
      setAddingLink(false);
    }
  }

  async function doRemove() {
    setRemoving(true);
    try {
      await apiRequest(`/admin/matches/${match.id}/photos/${remove.id}`, { method: 'DELETE' });
      notify('Photo removed.');
      setRemove(null);
      onChanged();
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    } finally {
      setRemoving(false);
    }
  }

  const busy = Boolean(progress);
  return (
    <Card>
      <CardHeader
        title="Match pictures"
        description={`Photos from this match. Shown on the website as “View Pictures” and in the Gallery.${photos.length ? ` ${photos.length} photo${photos.length === 1 ? '' : 's'}.` : ''}`}
      />
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" tabIndex={-1} onChange={onFiles} aria-hidden="true" />
          <Button icon={Upload} onClick={() => input.current?.click()} loading={busy} disabled={busy}>
            {busy ? `Uploading ${progress.done + 1} of ${progress.total}…` : 'Upload photos'}
          </Button>
          <span className="text-xs text-slate-500">JPG, PNG, WebP or GIF. Up to {MAX_PER_BATCH} at a time.</span>
        </div>
        {failures.length > 0 && (
          <Alert tone="warning" title="Some photos were not added">
            <ul className="list-disc pl-5">
              {failures.map((f, i) => (
                <li key={i}>
                  {f.name}: {f.message}
                </li>
              ))}
            </ul>
          </Alert>
        )}
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Or add a photo by link" error={linkError} hint="An https address of the image file itself (not a social media post).">
            <Input
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                setLinkError(null);
              }}
              inputMode="url"
              maxLength={1000}
              placeholder="https://"
            />
          </Field>
          <Button variant="outline" icon={Link2} onClick={onAddLink} loading={addingLink} className={linkError ? 'sm:mb-6' : ''}>
            Add link
          </Button>
        </div>
        {photos.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((p) => (
              <li key={p.id} className="overflow-hidden rounded-md border border-slate-200 bg-white">
                <SafeImage
                  src={imageUrl(p.image?.url, { width: 360, height: 270 })}
                  alt={p.image?.alt || p.caption || 'Match photo'}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                  fallback={<ImageUnavailable className="aspect-[4/3] w-full" />}
                />
                <div className="flex items-center justify-between gap-1 p-1">
                  <span className="min-w-0 truncate px-1 text-xs text-slate-600" title={p.caption}>
                    {p.status !== 'published' ? <Badge tone="warning">Hidden</Badge> : p.caption || 'No caption'}
                  </span>
                  <span className="flex shrink-0">
                    <IconButton icon={Pencil} label="Edit caption" onClick={() => setEdit(p)} />
                    <IconButton icon={Trash2} label="Remove photo" onClick={() => setRemove(p)} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 rounded-md bg-slate-50 p-4 text-sm text-slate-600">
            <Images aria-hidden="true" className="size-5 text-slate-400" />
            No pictures yet. “View Pictures” appears on the website once a photo is added.
          </p>
        )}
      </div>
      <ConfirmDialog open={Boolean(remove)} onClose={() => setRemove(null)} onConfirm={doRemove} loading={removing} title="Remove this photo?" confirmLabel="Remove">
        The photo is taken off this match and the Gallery.
      </ConfirmDialog>
      {edit && <CaptionDialog match={match} photo={edit} onClose={() => setEdit(null)} onSaved={onChanged} />}
    </Card>
  );
}

function CaptionDialog({ match, photo, onClose, onSaved }) {
  const { notify } = useToast();
  const form = useForm({ caption: photo.caption || '' });
  const onSubmit = form.submit(async (values) => {
    await apiRequest(`/admin/matches/${match.id}/photos/${photo.id}`, { method: 'PATCH', body: { caption: values.caption } });
    notify('Caption saved.');
    onSaved();
    onClose();
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit caption"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={form.submitting}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <FormError error={form.formError} />
        <Field label="Caption" error={form.errors.caption}>
          <Textarea value={form.values.caption} onChange={form.set('caption')} rows={3} maxLength={1000} />
        </Field>
      </form>
    </Modal>
  );
}

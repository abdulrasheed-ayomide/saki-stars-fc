import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Archive, Check, ExternalLink, Eye, Images, Megaphone, MessageSquare, Newspaper, Pencil, Plus, Send, Trash2, Undo2, Video, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useApi, qs } from '../../hooks/useApi.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { apiRequest } from '../../services/apiClient.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { AsyncContent, EmptyState, Alert } from '../../components/ui/Feedback.jsx';
import { StatusBadge, Badge } from '../../components/ui/Badge.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Button, ButtonLink, IconButton } from '../../components/ui/Button.jsx';
import { Field, Input, Select, Textarea, Checkbox } from '../../components/ui/Field.jsx';
import { Modal, ConfirmDialog } from '../../components/ui/Modal.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { MediaUpload } from '../../components/ui/ImageUpload.jsx';
import { FormError } from '../../components/ui/FormError.jsx';
import { useForm } from '../../components/ui/useForm.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { VideoPlayer, videoThumb } from '../../components/content/VideoCard.jsx';
import { Markdown } from '../../lib/markdown.jsx';
import { formatDate, formatDateTime, timeAgo, toDateInput } from '../../lib/format.js';
import { imageUrl } from '../../lib/media.js';
import { FilterBar, useCompetitions, useTeams } from './shared.jsx';
import { userMessage } from '../../lib/errors.js';

// ------------------------------------------------------------------------------------- News
export function NewsListPage() {
  useSeo({ title: 'News', noindex: true });
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const [q, setQ] = useState('');
  const debounced = useDebounce(q, 300);
  const page = Number(params.get('page') || 1);
  const state = useApi(`/admin/news${qs({ status, q: debounced, page })}`);
  const set = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  return (
    <>
      <PageHeader title="News" description="Draft, review, publish and archive club news." actions={can('news.create', 'news.edit') && <ButtonLink to="/dashboard/news/new" icon={Plus}>New article</ButtonLink>} />
      <Tabs label="Status" value={status} onChange={(v) => set('status', v)} tabs={[{ value: '', label: 'All' }, { value: 'draft', label: 'Drafts' }, { value: 'review', label: 'In review' }, { value: 'published', label: 'Published' }, { value: 'archived', label: 'Archived' }]} className="mb-4" />
      <div className="mb-4 max-w-sm">
        <Field label="Search headlines"><Input type="search" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
      </div>
      <AsyncContent state={state} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={Newspaper} title="No articles" action={can('news.create', 'news.edit') && <ButtonLink to="/dashboard/news/new" icon={Plus}>Write the first article</ButtonLink>} />}>
        {(d) => (
          <>
            <DataTable
              caption="Articles"
              rows={d.items}
              onRowClick={(n) => navigate(`/dashboard/news/${n.id}`)}
              columns={[
                { key: 'title', label: 'Headline', render: (n) => <span className="font-medium">{n.title}</span> },
                { key: 'cat', label: 'Category', render: (n) => n.category },
                { key: 'author', label: 'Author', render: (n) => n.author.name },
                { key: 'status', label: 'Status', render: (n) => <StatusBadge status={n.status} /> },
                { key: 'date', label: 'Published', render: (n) => (n.publishedAt ? formatDate(n.publishedAt) : '–') },
              ]}
            />
            <Pagination page={d.page} pages={d.pages} onChange={(p) => set('page', p)} className="mt-4" />
          </>
        )}
      </AsyncContent>
    </>
  );
}

const CATEGORIES = ['Club News', 'Match Report', 'Match Preview', 'Transfers', 'Youth', 'Academy', 'Community', 'Interviews', 'Announcements'];

export function NewsEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  useSeo({ title: isNew ? 'New article' : 'Edit article', noindex: true });
  const state = useApi(isNew ? null : `/admin/news/${id}`);
  if (!isNew && !state.data) return <AsyncContent state={state}>{() => null}</AsyncContent>;
  return <NewsEditor key={state.data?.updatedAt || 'new'} article={state.data} reload={state.reload} />;
}

function NewsEditor({ article, reload }) {
  const { can } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const competitions = useCompetitions();
  const teams = useTeams();
  const matches = useApi('/admin/matches?status=all&limit=50');
  const [preview, setPreview] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState('');
  const isNew = !article;
  const editable = isNew || article.canEdit;
  const form = useForm({
    title: article?.title || '',
    slug: article?.slug || '',
    excerpt: article?.excerpt || '',
    content: article?.content || '',
    featuredImage: article?.featuredImage || null,
    category: article?.category || 'Club News',
    competition: article?.competition?.id || '',
    team: article?.team?.id || '',
    relatedMatches: (article?.relatedMatches || []).map((m) => m.id),
    relatedPlayers: (article?.relatedPlayers || []).map((p) => p.id),
    allowComments: article ? article.allowComments : true,
  });
  const { values: v, set, errors: e } = form;

  const onSubmit = form.submit(async (values) => {
    const body = { ...values, competition: values.competition || null, team: values.team || null, featuredImage: values.featuredImage || null, slug: isNew ? undefined : values.slug };
    const saved = await apiRequest(isNew ? '/admin/news' : `/admin/news/${article.id}`, { method: isNew ? 'POST' : 'PUT', body });
    notify(isNew ? 'Draft saved.' : 'Article saved.');
    if (isNew) navigate(`/dashboard/news/${saved.id}`, { replace: true });
    else reload();
  });

  async function transition(action) {
    setBusy(action);
    try {
      await apiRequest(`/admin/news/${article.id}/${action}`, { method: 'POST', body: {} });
      notify({ submit: 'Sent for review.', withdraw: 'Moved back to drafts.', publish: 'Published on the website.', unpublish: 'Unpublished.', archive: 'Archived.' }[action]);
      reload();
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    } finally {
      setBusy('');
      setConfirm(null);
    }
  }

  async function remove() {
    try {
      await apiRequest(`/admin/news/${article.id}`, { method: 'DELETE' });
      notify('Article deleted.');
      navigate('/dashboard/news');
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    }
  }

  const st = article?.status;
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'News', to: '/dashboard/news' }, { label: isNew ? 'New article' : article.title }]}
        title={isNew ? 'New article' : article.title}
        description={isNew ? 'New articles start as drafts.' : `By ${article.author.name} · last updated ${timeAgo(article.updatedAt)}`}
        actions={
          !isNew && (
            <>
              {st === 'published' && <ButtonLink to={`/news/${article.slug}`} variant="outline" icon={ExternalLink} target="_blank">View</ButtonLink>}
              {st === 'draft' && editable && <Button variant="secondary" icon={Send} loading={busy === 'submit'} onClick={() => transition('submit')}>Submit for review</Button>}
              {st === 'review' && editable && <Button variant="outline" icon={Undo2} loading={busy === 'withdraw'} onClick={() => transition('withdraw')}>Back to draft</Button>}
              {can('news.publish') && st !== 'published' && <Button icon={Check} loading={busy === 'publish'} onClick={() => setConfirm('publish')}>Publish</Button>}
              {can('news.publish') && st === 'published' && <Button variant="outline" icon={Undo2} loading={busy === 'unpublish'} onClick={() => transition('unpublish')}>Unpublish</Button>}
              {can('news.publish') && st !== 'archived' && <Button variant="outline" icon={Archive} onClick={() => setConfirm('archive')}>Archive</Button>}
              {can('news.delete') && <IconButton label="Delete article" icon={Trash2} variant="danger-outline" onClick={() => setConfirm('delete')} />}
            </>
          )
        }
      />
      {!isNew && (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge status={st} />
          {article.publishedAt && <span className="text-slate-600">Published {formatDateTime(article.publishedAt)}</span>}
          {st === 'review' && <span className="text-slate-600">Waiting for someone who can publish.</span>}
        </p>
      )}
      {!editable && <Alert tone="info" className="mb-4">You can read this article but not change it.</Alert>}
      <form onSubmit={onSubmit} noValidate className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <fieldset disabled={!editable} className="min-w-0 space-y-4">
          <FormError error={form.formError} />
          <Card className="space-y-4 p-4">
            <Field label="Headline" required error={e.title}><Input value={v.title} onChange={set('title')} maxLength={200} className="text-lg font-semibold" /></Field>
            <Field label="Summary" error={e.excerpt} hint="Shown on news cards and in search results."><Textarea value={v.excerpt} onChange={set('excerpt')} rows={2} maxLength={400} /></Field>
            <div className="flex gap-2">
              <Button size="sm" variant={preview ? 'outline' : 'secondary'} onClick={() => setPreview(false)}>Write</Button>
              <Button size="sm" variant={preview ? 'secondary' : 'outline'} icon={Eye} onClick={() => setPreview(true)}>Preview</Button>
            </div>
            {preview ? (
              <div className="min-h-64 rounded-md border border-slate-200 p-4">
                <h2 className="mb-3 text-2xl font-bold text-brand-900">{v.title || 'Headline'}</h2>
                <Markdown text={v.content || '_Nothing to preview._'} />
              </div>
            ) : (
              <Field label="Article" required error={e.content} hint="Formatting: ## Heading, - list item, **bold**, *italic*, [link text](https://…)">
                <Textarea value={v.content} onChange={set('content')} rows={18} maxLength={50000} className="font-mono text-sm" />
              </Field>
            )}
          </Card>
        </fieldset>
        <fieldset disabled={!editable} className="min-w-0 space-y-4">
          <Card className="space-y-4 p-4">
            <MediaUpload label="Featured image" folder="news" value={v.featuredImage} onChange={set('featuredImage')} />
            <Field label="Category" error={e.category}>
              <Select value={v.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>
            </Field>
            <Field label="Competition" error={e.competition}>
              <Select value={v.competition} onChange={set('competition')}>
                <option value="">None</option>
                {competitions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Team" error={e.team}>
              <Select value={v.team} onChange={set('team')}>
                <option value="">None</option>
                {teams.filter((t) => t.isClubTeam).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Related match" error={e.relatedMatches}>
              <Select value={v.relatedMatches[0] || ''} onChange={(ev) => set('relatedMatches')(ev.target.value ? [ev.target.value] : [])}>
                <option value="">None</option>
                {(matches.data?.items || []).map((m) => <option key={m.id} value={m.id}>{formatDate(m.kickoffAt)} · {m.homeTeam?.name} v {m.awayTeam?.name}</option>)}
              </Select>
            </Field>
            {!isNew && (
              <Field label="Web address" error={e.slug} hint={st === 'published' ? 'Changing this breaks links people have shared.' : undefined}>
                <Input value={v.slug} onChange={set('slug')} maxLength={120} />
              </Field>
            )}
            <Checkbox checked={v.allowComments} onChange={set('allowComments')} label="Allow comments" />
          </Card>
          {editable && <Button type="submit" size="lg" className="w-full" loading={form.submitting}>{isNew ? 'Save draft' : 'Save changes'}</Button>}
        </fieldset>
      </form>
      <ConfirmDialog open={confirm === 'publish'} onClose={() => setConfirm(null)} onConfirm={() => transition('publish')} loading={busy === 'publish'} tone="primary" title="Publish this article?" confirmLabel="Publish">
        It will appear on the website straight away. Save any changes first.
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'archive'} onClose={() => setConfirm(null)} onConfirm={() => transition('archive')} loading={busy === 'archive'} title="Archive this article?" confirmLabel="Archive">
        It will be removed from the website but kept in the archive.
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'delete'} onClose={() => setConfirm(null)} onConfirm={remove} title="Delete this article?" confirmLabel="Delete">
        The article is removed from the website and hidden from the dashboard. The deletion is recorded in the audit log.
      </ConfirmDialog>
    </>
  );
}

// ------------------------------------------------------------------------------------- Videos
const VIDEO_CATEGORIES = ['Match Highlights', 'Goals', 'Interviews', 'Training', 'Behind the Scenes', 'Press Conference', 'Youth', 'NEXT GEN', 'Club TV'];

function VideoForm({ video, onClose, onSaved }) {
  const { notify } = useToast();
  const teams = useTeams({ clubOnly: true });
  const matches = useApi('/admin/matches?status=completed&limit=50');
  const form = useForm({
    title: video?.title || '',
    description: video?.description || '',
    category: video?.category || 'Match Highlights',
    source: video?.source || 'youtube',
    youtubeUrl: video?.youtubeUrl || '',
    media: video?.rawMedia || video?.media || null,
    team: video?.teamId || '',
    match: video?.matchId || '',
    status: video?.status || 'published',
    featured: Boolean(video?.featured),
    publishedAt: toDateInput(video?.publishedAt),
  });
  const { values: v, set, errors: e } = form;
  const onSubmit = form.submit(async (values) => {
    await apiRequest(video ? `/admin/videos/${video.id}` : '/admin/videos', {
      method: video ? 'PUT' : 'POST',
      body: { ...values, team: values.team || null, match: values.match || null, media: values.source === 'cloudinary' ? values.media : null, publishedAt: values.publishedAt || null },
    });
    notify('Video saved.');
    onSaved();
  });
  return (
    <Modal open onClose={onClose} title={video ? 'Edit video' : 'Add video'} size="lg" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={onSubmit} loading={form.submitting}>Save</Button></>}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError error={form.formError} />
        <Field label="Title" required error={e.title}><Input value={v.title} onChange={set('title')} maxLength={200} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" error={e.category}><Select value={v.category} onChange={set('category')}>{VIDEO_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Source" error={e.source}>
            <Select value={v.source} onChange={set('source')}>
              <option value="youtube">YouTube link</option>
              <option value="cloudinary">Upload a video file</option>
            </Select>
          </Field>
        </div>
        {v.source === 'youtube' ? (
          <Field label="YouTube link" required error={e.youtubeUrl} hint="Paste the address of the video, e.g. https://youtu.be/…"><Input value={v.youtubeUrl} onChange={set('youtubeUrl')} maxLength={300} /></Field>
        ) : (
          <div>
            <MediaUpload label="Video file" kind="video" folder="videos" value={v.media} onChange={set('media')} hint="MP4, WebM or MOV. Long videos are better on YouTube." />
            {e.media && <p className="mt-1 text-sm text-red-700">{e.media}</p>}
          </div>
        )}
        <Field label="Description" error={e.description}><Textarea value={v.description} onChange={set('description')} rows={3} maxLength={3000} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Team" error={e.team}><Select value={v.team} onChange={set('team')}><option value="">None</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Match" error={e.match}><Select value={v.match} onChange={set('match')}><option value="">None</option>{(matches.data?.items || []).map((m) => <option key={m.id} value={m.id}>{formatDate(m.kickoffAt)} · {m.homeTeam?.name} v {m.awayTeam?.name}</option>)}</Select></Field>
          <Field label="Status" error={e.status}><Select value={v.status} onChange={set('status')}><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></Select></Field>
          <Field label="Publish date" error={e.publishedAt}><Input type="date" value={v.publishedAt} onChange={set('publishedAt')} /></Field>
        </div>
        <Checkbox checked={v.featured} onChange={set('featured')} label="Feature this video" />
      </form>
    </Modal>
  );
}

export function VideosAdminPage() {
  useSeo({ title: 'Videos', noindex: true });
  const [f, setF] = useState({ status: '', category: '' });
  const [page, setPage] = useState(1);
  const state = useApi(`/admin/videos${qs({ ...f, page })}`);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [play, setPlay] = useState(null);
  const { notify } = useToast();
  async function openEdit(v) {
    try {
      setEdit(await apiRequest(`/admin/videos/${v.id}`));
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    }
  }
  async function remove() {
    try {
      await apiRequest(`/admin/videos/${del.id}`, { method: 'DELETE' });
      notify('Video removed.');
      state.reload();
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    } finally {
      setDel(null);
    }
  }
  return (
    <>
      <PageHeader title="Videos" description="YouTube links and uploaded videos for the website." actions={<Button icon={Plus} onClick={() => setEdit('new')}>Add video</Button>} />
      <FilterBar>
        <Field label="Status"><Select value={f.status} onChange={(e) => setF((x) => ({ ...x, status: e.target.value }))}><option value="">All</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></Select></Field>
        <Field label="Category"><Select value={f.category} onChange={(e) => setF((x) => ({ ...x, category: e.target.value }))}><option value="">All</option>{VIDEO_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
      </FilterBar>
      <AsyncContent state={state} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={Video} title="No videos yet" action={<Button icon={Plus} onClick={() => setEdit('new')}>Add a video</Button>} />}>
        {(d) => (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {d.items.map((v) => (
                <li key={v.id}>
                  <Card className="overflow-hidden">
                    <button type="button" onClick={() => setPlay(v)} className="relative block aspect-video w-full bg-brand-950" aria-label={`Play ${v.title}`}>
                      {videoThumb(v) && <img src={videoThumb(v)} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />}
                    </button>
                    <div className="p-3">
                      <p className="line-clamp-2 font-semibold">{v.title}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-600"><StatusBadge status={v.status} /> {v.category} · {v.source === 'youtube' ? 'YouTube' : 'Uploaded'}{v.featured && <Badge tone="brand">Featured</Badge>}</p>
                      <div className="mt-2 flex gap-1">
                        <Button size="sm" variant="outline" icon={Pencil} onClick={() => openEdit(v)}>Edit</Button>
                        <IconButton label={`Delete ${v.title}`} icon={Trash2} onClick={() => setDel(v)} />
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
            <Pagination page={d.page} pages={d.pages} onChange={setPage} className="mt-4" />
          </>
        )}
      </AsyncContent>
      {edit && <VideoForm video={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); state.reload(); }} />}
      <Modal open={Boolean(play)} onClose={() => setPlay(null)} title={play?.title || ''} size="xl">{play && <VideoPlayer video={play} />}</Modal>
      <ConfirmDialog open={Boolean(del)} onClose={() => setDel(null)} onConfirm={remove} title="Remove this video?" confirmLabel="Remove">It is removed from the website.</ConfirmDialog>
    </>
  );
}

// ------------------------------------------------------------------------------------- Gallery
const GALLERY_CATEGORIES = ['Matches', 'Training', 'Players', 'Youth', 'NEXT GEN', 'Fans', 'Events', 'Community'];

function GalleryForm({ item, onClose, onSaved }) {
  const { notify } = useToast();
  const teams = useTeams({ clubOnly: true });
  const form = useForm({
    title: item?.title || '',
    caption: item?.caption || '',
    category: item?.category || 'Matches',
    image: item?.image || null,
    team: item?.teamId || '',
    takenAt: toDateInput(item?.takenAt),
    photographer: item?.photographer || '',
    status: item?.status || 'published',
  });
  const { values: v, set, errors: e } = form;
  const onSubmit = form.submit(async (values) => {
    await apiRequest(item ? `/admin/gallery/${item.id}` : '/admin/gallery', { method: item ? 'PUT' : 'POST', body: { ...values, team: values.team || null, takenAt: values.takenAt || null } });
    notify('Photo saved.');
    onSaved();
  });
  return (
    <Modal open onClose={onClose} title={item ? 'Edit photo' : 'Add photo'} size="lg" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={onSubmit} loading={form.submitting} disabled={!v.image}>Save</Button></>}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError error={form.formError} />
        <MediaUpload label="Photo" folder="gallery" value={v.image} onChange={set('image')} />
        {e.image && <p className="text-sm text-red-700">{e.image}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" error={e.title}><Input value={v.title} onChange={set('title')} maxLength={200} /></Field>
          <Field label="Category" error={e.category}><Select value={v.category} onChange={set('category')}>{GALLERY_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Team" error={e.team}><Select value={v.team} onChange={set('team')}><option value="">None</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Date taken" error={e.takenAt}><Input type="date" value={v.takenAt} onChange={set('takenAt')} /></Field>
          <Field label="Photographer" error={e.photographer}><Input value={v.photographer} onChange={set('photographer')} maxLength={120} /></Field>
          <Field label="Visibility" error={e.status}><Select value={v.status} onChange={set('status')}><option value="published">Published</option><option value="hidden">Hidden</option></Select></Field>
        </div>
        <Field label="Caption" error={e.caption}><Textarea value={v.caption} onChange={set('caption')} rows={2} maxLength={1000} /></Field>
      </form>
    </Modal>
  );
}

export function GalleryAdminPage() {
  useSeo({ title: 'Gallery', noindex: true });
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const state = useApi(`/admin/gallery${qs({ category, page })}`);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const { notify } = useToast();
  async function remove() {
    try {
      await apiRequest(`/admin/gallery/${del.id}`, { method: 'DELETE' });
      notify('Photo removed.');
      state.reload();
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    } finally {
      setDel(null);
    }
  }
  return (
    <>
      <PageHeader title="Gallery" description="Photos are stored in Cloudinary and delivered in optimised sizes." actions={<Button icon={Plus} onClick={() => setEdit('new')}>Add photo</Button>} />
      <div className="mb-4 max-w-xs"><Field label="Category"><Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}><option value="">All</option>{GALLERY_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field></div>
      <AsyncContent state={state} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={Images} title="No photos yet" action={<Button icon={Plus} onClick={() => setEdit('new')}>Add a photo</Button>} />}>
        {(d) => (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {d.items.map((g) => (
                <li key={g.id}>
                  <Card className="overflow-hidden">
                    <img src={imageUrl(g.image.url, { width: 400, height: 300 })} alt={g.image.alt || g.title || ''} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                    <div className="p-2">
                      <p className="truncate text-sm font-medium">{g.title || g.category}</p>
                      <p className="flex items-center gap-1 text-xs text-slate-500"><StatusBadge status={g.status} /> {g.category}</p>
                      <div className="mt-1 flex gap-1">
                        <IconButton label="Edit photo" icon={Pencil} onClick={() => setEdit(g)} />
                        <IconButton label="Delete photo" icon={Trash2} onClick={() => setDel(g)} />
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
            <Pagination page={d.page} pages={d.pages} onChange={setPage} className="mt-4" />
          </>
        )}
      </AsyncContent>
      {edit && <GalleryForm item={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); state.reload(); }} />}
      <ConfirmDialog open={Boolean(del)} onClose={() => setDel(null)} onConfirm={remove} title="Remove this photo?" confirmLabel="Remove">It is removed from the website gallery.</ConfirmDialog>
    </>
  );
}

// ------------------------------------------------------------------------------------- Comments
export function CommentsAdminPage() {
  useSeo({ title: 'Comments', noindex: true });
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'flagged';
  const [page, setPage] = useState(1);
  const state = useApi(`/admin/comments${qs({ status, page })}`);
  const { notify } = useToast();
  const [busy, setBusy] = useState(null);
  async function moderate(c, s) {
    setBusy(c.id + s);
    try {
      await apiRequest(`/admin/comments/${c.id}/moderate`, { method: 'POST', body: { status: s } });
      notify(s === 'approved' ? 'Comment approved.' : 'Comment removed from view.');
      state.reload();
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <PageHeader title="Comments" description="Comments from verified users appear immediately. Suspicious and reported comments are listed here." />
      <Tabs label="Queue" value={status} onChange={(v) => { setParams({ status: v }, { replace: true }); setPage(1); }} tabs={[{ value: 'flagged', label: 'Needs attention' }, { value: 'pending', label: 'Held' }, { value: 'approved', label: 'Approved' }, { value: 'hidden', label: 'Hidden' }, { value: 'rejected', label: 'Rejected' }, { value: 'all', label: 'All' }]} className="mb-4" />
      <AsyncContent state={state} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={MessageSquare} title="Nothing to moderate" />}>
        {(d) => (
          <>
            <ul className="space-y-3">
              {d.items.map((c) => (
                <li key={c.id}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <p><span className="font-semibold">{c.authorName}</span> <span className="text-slate-500">({c.author?.email}) · {timeAgo(c.createdAt)} on <a href={c.target.link} target="_blank" rel="noreferrer" className="underline">{c.target.title}</a></span></p>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="mt-2 whitespace-pre-line text-slate-800">{c.body}</p>
                    {c.flaggedReason && <p className="mt-2 text-sm text-amber-800">Flag: {c.flaggedReason}</p>}
                    {c.reports.length > 0 && <p className="mt-1 text-sm text-slate-600">Reports ({c.reports.length}): {c.reports.map((r) => r.reason).join(' · ')}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {c.status !== 'approved' || c.reports.length ? <Button size="sm" icon={Check} loading={busy === c.id + 'approved'} onClick={() => moderate(c, 'approved')}>Approve</Button> : null}
                      {c.status !== 'hidden' && <Button size="sm" variant="outline" icon={Eye} loading={busy === c.id + 'hidden'} onClick={() => moderate(c, 'hidden')}>Hide</Button>}
                      {c.status !== 'rejected' && <Button size="sm" variant="danger-outline" icon={X} loading={busy === c.id + 'rejected'} onClick={() => moderate(c, 'rejected')}>Reject</Button>}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
            <Pagination page={d.page} pages={d.pages} onChange={setPage} className="mt-4" />
          </>
        )}
      </AsyncContent>
    </>
  );
}

// ------------------------------------------------------------------------------------- Announcements
export function AnnouncementsAdminPage() {
  useSeo({ title: 'Announcements', noindex: true });
  const { notify } = useToast();
  const teams = useTeams({ clubOnly: true });
  const [page, setPage] = useState(1);
  const state = useApi(`/admin/announcements${qs({ page })}`);
  const [confirm, setConfirm] = useState(false);
  const form = useForm({ title: '', body: '', audience: 'players', team: '' });
  const { values: v, set, errors: e } = form;
  const send = form.submit(async (values) => {
    const a = await apiRequest('/admin/announcements', { method: 'POST', body: { ...values, team: values.team || null } });
    notify(`Sent to ${a.recipientCount} people.`);
    form.setValues({ title: '', body: '', audience: values.audience, team: '' });
    setConfirm(false);
    state.reload();
  });
  const AUD = { everyone: 'Everyone with an account', players: 'All registered players', staff: 'All staff', team: 'One team (players and staff)' };
  return (
    <>
      <PageHeader title="Announcements" description="Send an in-app notification to a group. Important account emails are sent automatically; announcements are not emailed." />
      <div className="grid gap-4 xl:grid-cols-[2fr_3fr]">
        <Card className="p-4">
          <h2 className="font-semibold">New announcement</h2>
          <form onSubmit={(ev) => { ev.preventDefault(); setConfirm(true); }} className="mt-3 space-y-4" noValidate>
            <FormError error={form.formError} />
            <Field label="Send to" error={e.audience}><Select value={v.audience} onChange={set('audience')}>{Object.entries(AUD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            {v.audience === 'team' && <Field label="Team" required error={e.team}><Select value={v.team} onChange={set('team')}><option value="">Choose…</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>}
            <Field label="Title" required error={e.title}><Input value={v.title} onChange={set('title')} maxLength={200} /></Field>
            <Field label="Message" required error={e.body}><Textarea value={v.body} onChange={set('body')} rows={6} maxLength={5000} /></Field>
            <Button type="submit" icon={Megaphone} disabled={!v.title || !v.body}>Send announcement</Button>
          </form>
        </Card>
        <div>
          <h2 className="mb-3 font-semibold">Sent</h2>
          <AsyncContent state={state} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={Megaphone} title="No announcements sent yet" />}>
            {(d) => (
              <>
                <ul className="space-y-3">
                  {d.items.map((a) => (
                    <li key={a.id}><Card className="p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{a.title}</p><span className="text-xs text-slate-500">{formatDateTime(a.createdAt)}</span></div><p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-slate-700">{a.body}</p><p className="mt-2 text-xs text-slate-500">{AUD[a.audience]}{a.team ? `: ${a.team.name}` : ''} · {a.recipientCount} recipients · by {a.createdBy}</p></Card></li>
                  ))}
                </ul>
                <Pagination page={d.page} pages={d.pages} onChange={setPage} className="mt-4" />
              </>
            )}
          </AsyncContent>
        </div>
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={send} loading={form.submitting} tone="primary" title="Send this announcement?" confirmLabel="Send">
        It will be delivered to: {AUD[v.audience]}. It cannot be unsent.
      </ConfirmDialog>
    </>
  );
}

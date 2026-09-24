import { useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Binoculars, ClipboardList, Download, FileText, History, Inbox, Plus, Search, Server, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useApi, qs } from '../../hooks/useApi.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { apiRequest, downloadFile, uploadFile } from '../../services/apiClient.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { AsyncContent, EmptyState, Alert } from '../../components/ui/Feedback.jsx';
import { StatusBadge, Badge } from '../../components/ui/Badge.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { Field, Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { Modal, ConfirmDialog } from '../../components/ui/Modal.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { FormError } from '../../components/ui/FormError.jsx';
import { useForm } from '../../components/ui/useForm.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { NotificationCentre } from '../account/NotificationsPage.jsx';
import { formatDate, formatDateTime, timeAgo, toDateInput } from '../../lib/format.js';
import { titleCase } from '../../lib/labels.js';
import { FilterBar, useTeams } from './shared.jsx';

// ------------------------------------------------------------------------------------- Reports
const REPORT_TYPES = ['general', 'match', 'training', 'observation', 'incident', 'recommendation', 'medical', 'technical'];

export function ReportsListPage() {
  useSeo({ title: 'Reports', noindex: true });
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const f = { status: params.get('status') || '', type: params.get('type') || '' };
  const [page, setPage] = useState(1);
  const state = useApi(`/admin/reports${qs({ ...f, page })}`);
  const [creating, setCreating] = useState(false);
  const set = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
    setPage(1);
  };
  return (
    <>
      <PageHeader title="Staff reports" description="Operational records: match and training reports, observations, incidents and recommendations. Reports are never used to rank staff." actions={can('reports.create') && <Button icon={Plus} onClick={() => setCreating(true)}>New report</Button>} />
      <FilterBar>
        <Field label="Status"><Select value={f.status} onChange={(e) => set('status', e.target.value)}><option value="">All</option>{['submitted', 'under_review', 'reviewed', 'archived'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></Field>
        <Field label="Type"><Select value={f.type} onChange={(e) => set('type', e.target.value)}><option value="">All</option>{REPORT_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select></Field>
      </FilterBar>
      <AsyncContent state={state} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={ClipboardList} title="No reports" />}>
        {(d) => (
          <>
            <DataTable
              caption="Reports"
              rows={d.items}
              onRowClick={(r) => navigate(`/dashboard/reports/${r.id}`)}
              columns={[
                { key: 'title', label: 'Title', render: (r) => <span className="font-medium">{r.title}</span> },
                { key: 'type', label: 'Type', render: (r) => titleCase(r.type) },
                { key: 'author', label: 'By', render: (r) => `${r.authorName} (${r.authorRoleLabel})` },
                { key: 'about', label: 'About', render: (r) => r.player?.name || r.team?.name || (r.match ? `${r.match.homeTeam?.name} v ${r.match.awayTeam?.name}` : '–') },
                { key: 'date', label: 'Submitted', render: (r) => formatDate(r.createdAt) },
                { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              ]}
            />
            <Pagination page={d.page} pages={d.pages} onChange={setPage} className="mt-4" />
          </>
        )}
      </AsyncContent>
      {creating && <ReportForm onClose={() => setCreating(false)} onSaved={(r) => navigate(`/dashboard/reports/${r.id}`)} />}
    </>
  );
}

function ReportForm({ onClose, onSaved }) {
  const { notify } = useToast();
  const teams = useTeams({ clubOnly: true });
  const players = useApi('/admin/players?limit=100');
  const matches = useApi('/admin/matches?status=all&limit=50');
  const form = useForm({ type: 'general', title: '', content: '', team: '', player: '', match: '' });
  const { values: v, set, errors: e } = form;
  const onSubmit = form.submit(async (values) => {
    const r = await apiRequest('/admin/reports', { method: 'POST', body: { ...values, team: values.team || null, player: values.player || null, match: values.match || null } });
    notify('Report submitted.');
    onSaved(r);
  });
  return (
    <Modal open onClose={onClose} title="New report" size="lg" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={onSubmit} loading={form.submitting}>Submit report</Button></>}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError error={form.formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" error={e.type}><Select value={v.type} onChange={set('type')}>{REPORT_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select></Field>
          <Field label="Title" required error={e.title}><Input value={v.title} onChange={set('title')} maxLength={200} /></Field>
          <Field label="Team (optional)" error={e.team}><Select value={v.team} onChange={set('team')}><option value="">None</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          {players.data && <Field label="Player (optional)" error={e.player}><Select value={v.player} onChange={set('player')}><option value="">None</option>{players.data.items.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}</Select></Field>}
          {matches.data && <Field label="Match (optional)" error={e.match} className="sm:col-span-2"><Select value={v.match} onChange={set('match')}><option value="">None</option>{matches.data.items.map((m) => <option key={m.id} value={m.id}>{formatDate(m.kickoffAt)} · {m.homeTeam?.name} v {m.awayTeam?.name}</option>)}</Select></Field>}
        </div>
        <Field label="Report" required error={e.content}><Textarea value={v.content} onChange={set('content')} rows={10} maxLength={20000} /></Field>
      </form>
    </Modal>
  );
}

export function ReportDetailPage() {
  const { id } = useParams();
  useSeo({ title: 'Report', noindex: true });
  const { notify } = useToast();
  const state = useApi(`/admin/reports/${id}`);
  const [review, setReview] = useState({ status: 'reviewed', reviewNote: '' });
  const [busy, setBusy] = useState(false);
  async function submitReview() {
    setBusy(true);
    try {
      await apiRequest(`/admin/reports/${id}/review`, { method: 'POST', body: review });
      notify('Review saved. The author has been notified.');
      state.reload();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  const r = state.data;
  return (
    <>
      <PageHeader breadcrumbs={[{ label: 'Reports', to: '/dashboard/reports' }, { label: r?.title || '…' }]} title={r?.title || 'Report'} description={r ? `${titleCase(r.type)} report by ${r.authorName} (${r.authorRoleLabel}) · ${formatDateTime(r.createdAt)}` : ''} />
      <AsyncContent state={state}>
        {(rep) => (
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Card className="p-4">
              <div className="mb-3 flex flex-wrap gap-2 text-sm">
                <StatusBadge status={rep.status} />
                {rep.team && <Badge>{rep.team.name}</Badge>}
                {rep.player && <Badge tone="brand">{rep.player.name}</Badge>}
                {rep.match && <Badge>{rep.match.homeTeam?.name} v {rep.match.awayTeam?.name}</Badge>}
              </div>
              <p className="whitespace-pre-line text-slate-800">{rep.content}</p>
            </Card>
            <Card className="h-fit p-4">
              <h2 className="font-semibold">Review</h2>
              {rep.reviewedAt && <p className="mt-2 text-sm text-slate-600">Reviewed by {rep.reviewer} on {formatDateTime(rep.reviewedAt)}</p>}
              {rep.reviewNote && <p className="mt-2 rounded bg-slate-50 p-2 text-sm">{rep.reviewNote}</p>}
              {rep.canReview && (
                <div className="mt-3 space-y-3">
                  <Field label="Status"><Select value={review.status} onChange={(e) => setReview((x) => ({ ...x, status: e.target.value }))}><option value="under_review">Under review</option><option value="reviewed">Reviewed</option><option value="archived">Archived</option></Select></Field>
                  <Field label="Note to the author"><Textarea value={review.reviewNote} onChange={(e) => setReview((x) => ({ ...x, reviewNote: e.target.value }))} rows={3} maxLength={3000} /></Field>
                  <Button onClick={submitReview} loading={busy}>Save review</Button>
                </div>
              )}
            </Card>
          </div>
        )}
      </AsyncContent>
    </>
  );
}

// ------------------------------------------------------------------------------------- Scouting
const RECOMMENDATIONS = [['sign', 'Sign'], ['trial', 'Invite to trial'], ['monitor', 'Keep monitoring'], ['reject', 'Not suitable'], ['undecided', 'Undecided']];
const RATINGS = ['technical', 'tactical', 'physical', 'mental', 'potential'];

export function ScoutingPage() {
  useSeo({ title: 'Scouting', noindex: true });
  const { can, scopeOf } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('reports');
  const [q, setQ] = useState('');
  const debounced = useDebounce(q, 300);
  const reports = useApi(tab === 'reports' ? `/admin/scouting/reports${qs({ q: debounced })}` : null);
  const assignments = useApi(tab === 'assignments' ? '/admin/scouting/assignments' : null);
  const [assigning, setAssigning] = useState(false);
  const { notify } = useToast();
  async function setStatus(a, status) {
    try {
      await apiRequest(`/admin/scouting/assignments/${a.id}`, { method: 'PATCH', body: { status } });
      assignments.reload();
    } catch (err) {
      notify(err.message, 'error');
    }
  }
  return (
    <>
      <PageHeader
        title="Scouting"
        description={scopeOf('scouting.view') === 'all' ? 'All scouting work. This area is private and never appears on the website.' : 'Your private scouting workspace. Only you and the Director can see your reports.'}
        actions={
          <>
            {can('scouting.manage') && <ButtonLink to="/dashboard/scouting/reports/new" icon={Plus}>New scouting report</ButtonLink>}
            {can('scouting.assign') && <Button variant="outline" icon={Plus} onClick={() => setAssigning(true)}>Assign a target</Button>}
          </>
        }
      />
      <Tabs label="Scouting" value={tab} onChange={setTab} tabs={[{ value: 'reports', label: 'Reports' }, { value: 'assignments', label: 'Assignments' }]} className="mb-4" />
      {tab === 'reports' && (
        <>
          <div className="mb-4 max-w-sm"><Field label="Search by name"><Input type="search" value={q} onChange={(e) => setQ(e.target.value)} /></Field></div>
          <AsyncContent state={reports} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={Binoculars} title="No scouting reports yet" />}>
            {(d) => (
              <DataTable
                caption="Scouting reports"
                rows={d.items}
                onRowClick={(r) => navigate(`/dashboard/scouting/reports/${r.id}`)}
                columns={[
                  { key: 'name', label: 'Player', render: (r) => <span className="font-medium">{r.subject.name}</span> },
                  { key: 'club', label: 'Club / position', render: (r) => [r.subject.currentClub, r.subject.position].filter(Boolean).join(' · ') || (r.subject.player ? 'Club player' : '–') },
                  { key: 'rec', label: 'Recommendation', render: (r) => RECOMMENDATIONS.find(([k]) => k === r.recommendation)?.[1] },
                  { key: 'potential', label: 'Potential', render: (r) => r.ratings?.potential ?? '–' },
                  { key: 'scout', label: 'Scout', render: (r) => r.scoutName },
                  { key: 'date', label: 'Date', render: (r) => formatDate(r.createdAt) },
                ]}
              />
            )}
          </AsyncContent>
        </>
      )}
      {tab === 'assignments' && (
        <AsyncContent state={assignments} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={Binoculars} title="No assignments" />}>
          {(d) => (
            <ul className="space-y-3">
              {d.items.map((a) => (
                <li key={a.id}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{a.subject.name}{a.subject.currentClub ? ` · ${a.subject.currentClub}` : ''}</p>
                      <StatusBadge status={a.status} />
                    </div>
                    <p className="mt-1 text-sm text-slate-600">Scout: {a.scout.name || '–'}{a.dueDate ? ` · Due ${formatDate(a.dueDate)}` : ''} · Assigned by {a.assignedBy}</p>
                    {a.instructions && <p className="mt-2 whitespace-pre-line text-sm">{a.instructions}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {a.status === 'open' && <Button size="sm" variant="outline" onClick={() => setStatus(a, 'in_progress')}>Start</Button>}
                      {can('scouting.manage') && a.status !== 'completed' && <ButtonLink size="sm" to={`/dashboard/scouting/reports/new?assignment=${a.id}&name=${encodeURIComponent(a.subject.name)}&player=${a.subject.player?.id || ''}`}>Write report</ButtonLink>}
                      {can('scouting.assign') && a.status !== 'cancelled' && a.status !== 'completed' && <Button size="sm" variant="ghost" onClick={() => setStatus(a, 'cancelled')}>Cancel</Button>}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </AsyncContent>
      )}
      {assigning && <AssignDialog onClose={() => setAssigning(false)} onSaved={() => { setAssigning(false); setTab('assignments'); assignments.reload(); }} />}
    </>
  );
}

function AssignDialog({ onClose, onSaved }) {
  const { notify } = useToast();
  const scouts = useApi('/admin/scouting/scouts');
  const players = useApi('/admin/players?limit=100');
  const form = useForm({ scout: '', player: '', name: '', currentClub: '', position: '', instructions: '', dueDate: '' });
  const { values: v, set, errors: e } = form;
  const onSubmit = form.submit(async (values) => {
    await apiRequest('/admin/scouting/assignments', {
      method: 'POST',
      body: { scout: values.scout, subject: { player: values.player || null, name: values.name, currentClub: values.currentClub, position: values.position }, instructions: values.instructions, dueDate: values.dueDate || null },
    });
    notify('Assignment sent to the scout.');
    onSaved();
  });
  return (
    <Modal open onClose={onClose} title="Assign a scouting target" size="lg" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={onSubmit} loading={form.submitting}>Assign</Button></>}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError error={form.formError} />
        <Field label="Scout" required error={e.scout}><Select value={v.scout} onChange={set('scout')}><option value="">Choose…</option>{(scouts.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Existing club player (optional)" error={e['subject.player']}><Select value={v.player} onChange={set('player')}><option value="">An external prospect</option>{(players.data?.items || []).map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}</Select></Field>
        {!v.player && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Prospect's name" required error={e['subject.name'] || e.subject}><Input value={v.name} onChange={set('name')} maxLength={120} /></Field>
            <Field label="Current club"><Input value={v.currentClub} onChange={set('currentClub')} maxLength={120} /></Field>
            <Field label="Position"><Input value={v.position} onChange={set('position')} maxLength={60} /></Field>
          </div>
        )}
        <Field label="Instructions" error={e.instructions}><Textarea value={v.instructions} onChange={set('instructions')} rows={3} maxLength={3000} /></Field>
        <Field label="Due date" error={e.dueDate}><Input type="date" value={v.dueDate} onChange={set('dueDate')} /></Field>
      </form>
    </Modal>
  );
}

export function ScoutingReportPage() {
  const { id } = useParams();
  const isNew = !id;
  useSeo({ title: 'Scouting report', noindex: true });
  const state = useApi(isNew ? null : `/admin/scouting/reports/${id}`);
  if (!isNew && !state.data) return <AsyncContent state={state}>{() => null}</AsyncContent>;
  return <ScoutingReportForm key={state.data?.updatedAt || 'new'} report={state.data} reload={state.reload} />;
}

function ScoutingReportForm({ report, reload }) {
  const { notify } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const players = useApi('/admin/players?limit=100');
  const input = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [del, setDel] = useState(false);
  const isNew = !report;
  const editable = isNew || report.canEdit;
  const form = useForm({
    assignment: report?.assignment || params.get('assignment') || null,
    player: report?.subject?.player?.id || params.get('player') || '',
    name: report?.subject?.name || params.get('name') || '',
    currentClub: report?.subject?.currentClub || '',
    position: report?.subject?.position || '',
    birthYear: report?.subject?.birthYear ?? '',
    location: report?.subject?.location || '',
    matchObserved: report?.matchObserved || '',
    observedAt: toDateInput(report?.observedAt),
    observations: report?.observations || '',
    strengths: report?.strengths || '',
    weaknesses: report?.weaknesses || '',
    ratings: Object.fromEntries(RATINGS.map((k) => [k, report?.ratings?.[k] ?? ''])),
    recommendation: report?.recommendation || 'undecided',
    attachments: [],
    status: 'submitted',
  });
  const { values: v, set, errors: e } = form;

  const onSubmit = form.submit(async (values) => {
    const body = {
      assignment: values.assignment || null,
      subject: { player: values.player || null, name: values.name, currentClub: values.currentClub, position: values.position, birthYear: values.birthYear ? Number(values.birthYear) : null, location: values.location },
      matchObserved: values.matchObserved,
      observedAt: values.observedAt || null,
      observations: values.observations,
      strengths: values.strengths,
      weaknesses: values.weaknesses,
      ratings: Object.fromEntries(Object.entries(values.ratings).map(([k, x]) => [k, x === '' ? null : Number(x)])),
      recommendation: values.recommendation,
      attachments: values.attachments,
      status: values.status,
    };
    const saved = await apiRequest(isNew ? '/admin/scouting/reports' : `/admin/scouting/reports/${report.id}`, { method: isNew ? 'POST' : 'PUT', body });
    notify('Scouting report saved.');
    if (isNew) navigate(`/dashboard/scouting/reports/${saved.id}`, { replace: true });
    else reload();
  });

  async function attach(ev) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const m = await uploadFile('/media/upload?folder=scouting&kind=image', file);
      set('attachments')([...v.attachments, m]);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  async function openAttachment(i) {
    try {
      const { url } = await apiRequest(`/admin/scouting/reports/${report.id}/attachments/${i}`);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  async function remove() {
    try {
      await apiRequest(`/admin/scouting/reports/${report.id}`, { method: 'DELETE' });
      notify('Report deleted.');
      navigate('/dashboard/scouting');
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Scouting', to: '/dashboard/scouting' }, { label: isNew ? 'New report' : report.subject.name }]}
        title={isNew ? 'New scouting report' : report.subject.name}
        description={isNew ? 'Private: visible only to you and staff with club-wide scouting access.' : `By ${report.scoutName} · ${formatDateTime(report.createdAt)}`}
        actions={!isNew && editable && <Button variant="danger-outline" icon={Trash2} onClick={() => setDel(true)}>Delete</Button>}
      />
      {!editable && <Alert tone="info" className="mb-4">Read-only: only the author can change this report.</Alert>}
      <form onSubmit={onSubmit} noValidate>
        <fieldset disabled={!editable} className="space-y-4">
          <FormError error={form.formError} />
          <Card>
            <CardHeader title="Who" />
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Club player (optional)"><Select value={v.player} onChange={set('player')}><option value="">External prospect</option>{(players.data?.items || []).map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}</Select></Field>
              {!v.player && <Field label="Name" required error={e['subject.name'] || e.subject}><Input value={v.name} onChange={set('name')} maxLength={120} /></Field>}
              <Field label="Current club"><Input value={v.currentClub} onChange={set('currentClub')} maxLength={120} /></Field>
              <Field label="Position"><Input value={v.position} onChange={set('position')} maxLength={60} /></Field>
              <Field label="Year of birth"><Input type="number" min={1950} max={2100} value={v.birthYear} onChange={set('birthYear')} /></Field>
              <Field label="Location"><Input value={v.location} onChange={set('location')} maxLength={120} /></Field>
              <Field label="Match observed"><Input value={v.matchObserved} onChange={set('matchObserved')} maxLength={200} /></Field>
              <Field label="Date observed"><Input type="date" value={v.observedAt} onChange={set('observedAt')} /></Field>
            </div>
          </Card>
          <Card>
            <CardHeader title="Assessment" />
            <div className="space-y-4 p-4">
              <Field label="Observations" required error={e.observations}><Textarea value={v.observations} onChange={set('observations')} rows={8} maxLength={20000} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Strengths"><Textarea value={v.strengths} onChange={set('strengths')} rows={3} maxLength={3000} /></Field>
                <Field label="Areas to improve"><Textarea value={v.weaknesses} onChange={set('weaknesses')} rows={3} maxLength={3000} /></Field>
              </div>
              <fieldset>
                <legend className="text-sm font-medium">Ratings (1–10)</legend>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {RATINGS.map((k) => <Field key={k} label={titleCase(k)}><Input type="number" min={1} max={10} value={v.ratings[k]} onChange={set(`ratings.${k}`)} /></Field>)}
                </div>
              </fieldset>
              <Field label="Recommendation"><Select value={v.recommendation} onChange={set('recommendation')}>{RECOMMENDATIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            </div>
          </Card>
          <Card>
            <CardHeader title="Attachments" description="Photos are stored privately; links expire after 5 minutes." />
            <div className="p-4">
              {!isNew && report.attachments.length > 0 && (
                <ul className="mb-3 space-y-1">
                  {report.attachments.map((a) => (
                    <li key={a.index}><Button variant="outline" size="sm" icon={FileText} onClick={() => openAttachment(a.index)}>Attachment {a.index + 1} ({a.format})</Button></li>
                  ))}
                </ul>
              )}
              {v.attachments.length > 0 && <p className="mb-2 text-sm text-slate-600">{v.attachments.length} new file(s) ready to save.</p>}
              {editable && <Button variant="outline" icon={Upload} loading={uploading} onClick={() => input.current?.click()}>Add photo</Button>}
              <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={attach} />
            </div>
          </Card>
          {editable && (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="lg" loading={form.submitting} onClick={() => set('status')('submitted')}>{isNew ? 'Submit report' : 'Save report'}</Button>
              {isNew && <Button type="submit" size="lg" variant="outline" onClick={() => set('status')('draft')}>Save as draft</Button>}
            </div>
          )}
        </fieldset>
      </form>
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={remove} title="Delete this scouting report?" confirmLabel="Delete">This cannot be undone.</ConfirmDialog>
    </>
  );
}

// ------------------------------------------------------------------------------------- Contact messages
export function ContactAdminPage() {
  useSeo({ title: 'Messages', noindex: true });
  const { notify } = useToast();
  const [tab, setTab] = useState('messages');
  const [status, setStatus] = useState('new');
  const [page, setPage] = useState(1);
  const messages = useApi(tab === 'messages' ? `/admin/contact/messages${qs({ status, page })}` : null);
  const subs = useApi(tab === 'subscribers' ? `/admin/contact/subscribers${qs({ page })}` : null);
  const [open, setOpen] = useState(null);
  async function mark(m, s) {
    try {
      await apiRequest(`/admin/contact/messages/${m.id}`, { method: 'PATCH', body: { status: s } });
      messages.reload();
      setOpen(null);
    } catch (err) {
      notify(err.message, 'error');
    }
  }
  async function view(m) {
    setOpen(m);
    if (m.status === 'new') {
      await apiRequest(`/admin/contact/messages/${m.id}`, { method: 'PATCH', body: { status: 'read' } }).catch(() => {});
      messages.reload();
    }
  }
  return (
    <>
      <PageHeader title="Messages" description="Contact-form messages and email subscribers." />
      <Tabs label="Section" value={tab} onChange={(v) => { setTab(v); setPage(1); }} tabs={[{ value: 'messages', label: 'Contact messages', count: messages.data?.unread }, { value: 'subscribers', label: 'Newsletter subscribers' }]} className="mb-4" />
      {tab === 'messages' && (
        <>
          <div className="mb-4 max-w-xs"><Field label="Show"><Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="new">New</option><option value="read">Read</option><option value="replied">Replied</option><option value="archived">Archived</option><option value="spam">Spam</option><option value="all">All (except spam)</option></Select></Field></div>
          <AsyncContent state={messages} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={Inbox} title="No messages here" />}>
            {(d) => (
              <>
                <DataTable caption="Messages" rows={d.items} onRowClick={view} columns={[
                  { key: 'from', label: 'From', render: (m) => <span className={m.status === 'new' ? 'font-semibold' : ''}>{m.name}</span> },
                  { key: 'subject', label: 'Subject', render: (m) => m.subject },
                  { key: 'date', label: 'Received', render: (m) => timeAgo(m.createdAt) },
                  { key: 'status', label: 'Status', render: (m) => <StatusBadge status={m.status} /> },
                ]} />
                <Pagination page={d.page} pages={d.pages} onChange={setPage} className="mt-4" />
              </>
            )}
          </AsyncContent>
        </>
      )}
      {tab === 'subscribers' && (
        <>
          <Button variant="outline" icon={Download} className="mb-4" onClick={() => downloadFile('/admin/contact/subscribers?format=csv', 'subscribers.csv').catch((err) => notify(err.message, 'error'))}>Download CSV</Button>
          <AsyncContent state={subs} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={Inbox} title="No confirmed subscribers yet" />}>
            {(d) => (
              <>
                <DataTable caption="Subscribers" rows={d.items} columns={[{ key: 'email', label: 'Email' }, { key: 'date', label: 'Confirmed', render: (s) => formatDate(s.confirmedAt) }]} />
                <Pagination page={d.page} pages={d.pages} onChange={setPage} className="mt-4" />
              </>
            )}
          </AsyncContent>
        </>
      )}
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open?.subject || ''} description={open ? `${open.name} · ${formatDateTime(open.createdAt)}` : ''} size="lg" footer={open && <><Button variant="outline" onClick={() => mark(open, 'archived')}>Archive</Button><Button variant="outline" onClick={() => mark(open, 'spam')}>Mark as spam</Button><Button onClick={() => mark(open, 'replied')}>Mark as replied</Button></>}>
        {open && (
          <div className="space-y-3 text-sm">
            <p>
              <a href={`mailto:${open.email}?subject=${encodeURIComponent(`Re: ${open.subject}`)}`} className="font-semibold text-brand-700 underline">{open.email}</a>
              {open.phone && <> · <a href={`tel:${open.phone}`} className="underline">{open.phone}</a></>}
            </p>
            <p className="whitespace-pre-line rounded bg-slate-50 p-3 text-slate-800">{open.message}</p>
            {open.emailForwarded && <p className="text-xs text-slate-500">This message was also forwarded to the club inbox.</p>}
          </div>
        )}
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------------------------- Audit log
export function AuditPage() {
  useSeo({ title: 'Audit log', noindex: true });
  const [params] = useSearchParams();
  const [f, setF] = useState({ action: params.get('action') || '', status: '', entityType: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const actions = useApi('/admin/audit/actions');
  const state = useApi(`/admin/audit${qs({ ...f, page })}`);
  const [open, setOpen] = useState(null);
  const upd = (k) => (e) => {
    setF((x) => ({ ...x, [k]: e.target.value }));
    setPage(1);
  };
  return (
    <>
      <PageHeader title="Audit log" description="Important actions: sign-ins, role and permission changes, approvals, publishing, deletions and access to sensitive data. Secrets are never recorded." />
      <FilterBar>
        <Field label="Action"><Select value={f.action} onChange={upd('action')}><option value="">All actions</option>{[...new Set((actions.data || []).map((a) => `${a.split('.')[0]}.`))].map((g) => <option key={g} value={g}>{g}* (all)</option>)}{(actions.data || []).map((a) => <option key={a} value={a}>{a}</option>)}</Select></Field>
        <Field label="Result"><Select value={f.status} onChange={upd('status')}><option value="">All</option><option value="success">Success</option><option value="failure">Failure</option><option value="denied">Denied</option></Select></Field>
        <Field label="From"><Input type="date" value={f.from} onChange={upd('from')} /></Field>
        <Field label="To"><Input type="date" value={f.to} onChange={upd('to')} /></Field>
      </FilterBar>
      <AsyncContent state={state} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={History} title="No matching activity" />}>
        {(d) => (
          <>
            <DataTable caption="Audit log" rows={d.items} onRowClick={setOpen} columns={[
              { key: 'time', label: 'When', render: (a) => formatDateTime(a.createdAt) },
              { key: 'actor', label: 'Who', render: (a) => a.actor ? a.actor.name || a.actor.email : 'System / anonymous' },
              { key: 'action', label: 'Action', render: (a) => <code className="text-xs">{a.action}</code> },
              { key: 'entity', label: 'Record', render: (a) => (a.entityType ? `${a.entityType}${a.entityId ? ` ${a.entityId.slice(-6)}` : ''}` : '–') },
              { key: 'status', label: 'Result', render: (a) => <StatusBadge status={a.status} /> },
            ]} />
            <Pagination page={d.page} pages={d.pages} onChange={setPage} className="mt-4" />
          </>
        )}
      </AsyncContent>
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open?.action || ''} size="lg">
        {open && (
          <dl className="space-y-2 text-sm">
            {[['When', formatDateTime(open.createdAt)], ['Who', open.actor ? `${open.actor.name} <${open.actor.email}>` : 'System / anonymous'], ['Result', open.status], ['Record', `${open.entityType} ${open.entityId}`], ['IP address', open.ip], ['Device', open.userAgent], ['Request ID', open.requestId]].map(([k, v]) => (
              <div key={k} className="grid gap-1 sm:grid-cols-[8rem_1fr]"><dt className="text-slate-500">{k}</dt><dd className="break-all">{v || '–'}</dd></div>
            ))}
            <div><dt className="text-slate-500">Details</dt><dd><pre className="mt-1 max-h-72 overflow-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(open.metadata, null, 2)}</pre></dd></div>
          </dl>
        )}
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------------------------- System
export function SystemPage() {
  useSeo({ title: 'System', noindex: true });
  const state = useApi('/admin/dashboard/system');
  return (
    <>
      <PageHeader title="System" description="Technical status for the IT Manager. Secrets are never shown here." actions={<Button variant="outline" onClick={state.reload}>Refresh</Button>} />
      <AsyncContent state={state}>
        {(s) => (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h2 className="flex items-center gap-2 font-semibold"><Server aria-hidden="true" className="size-4" />Server</h2>
              <dl className="mt-3 space-y-1 text-sm">
                {[['Environment', s.environment], ['Node.js', s.nodeVersion], ['Uptime', `${Math.round(s.uptimeSeconds / 60)} minutes`], ['Memory', `${s.memoryMb} MB`], ['Database', `${s.database.state} (${s.database.name})`], ['Transactions', s.database.transactions ? 'Supported' : 'Not supported (local database)']].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2"><dt className="text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>
                ))}
              </dl>
            </Card>
            <Card className="p-4">
              <h2 className="font-semibold">Integrations</h2>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between gap-2"><dt className="text-slate-500">Email ({s.integrations.email.transport})</dt><dd>{s.integrations.email.configured ? <Badge tone="success">Configured</Badge> : <Badge tone="warning">Not sending real email</Badge>}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-slate-500">Email sender</dt><dd>{s.integrations.email.sender}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-slate-500">Cloudinary uploads</dt><dd>{s.integrations.cloudinary.configured ? <Badge tone="success">Configured</Badge> : <Badge tone="warning">Not configured</Badge>}</dd></div>
              </dl>
            </Card>
            <Card className="p-4">
              <h2 className="font-semibold">Security (last 24 hours)</h2>
              <dl className="mt-3 space-y-1 text-sm">
                {[['Failed sign-ins', s.security.last24h.failedLogins], ['Denied requests', s.security.last24h.deniedRequests], ['Stolen-token alerts', s.security.last24h.tokenReuse], ['Access token lifetime', `${s.security.accessTokenMinutes} min`], ['Refresh token lifetime', `${s.security.refreshTokenDays} days`], ['Secure cookies', s.security.cookieSecure ? 'Yes' : 'No (development)'], ['Allowed website origins', s.security.corsOrigins.join(', ') || '–'], ['Your IP as the server sees it', s.security.yourIp || '–'], ['Trusted proxy hops (TRUST_PROXY)', `${s.security.trustProxy} (request passed through ${s.security.forwardedHops})`]].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
                ))}
              </dl>
              <Link to="/dashboard/audit?action=auth." className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-brand-700 underline">Sign-in activity</Link>
            </Card>
            <Card className="p-4">
              <h2 className="font-semibold">Backups</h2>
              <p className="mt-2 text-sm text-slate-700">{s.backups.note}</p>
              <h3 className="mt-4 text-sm font-semibold">Collections</h3>
              <ul className="mt-1 grid grid-cols-2 gap-x-4 text-xs text-slate-600">{s.database.collections.map((c) => <li key={c.name} className="flex justify-between"><span>{c.name}</span><span>{c.documents}</span></li>)}</ul>
            </Card>
          </div>
        )}
      </AsyncContent>
    </>
  );
}

export function DashboardNotificationsPage() {
  useSeo({ title: 'Notifications', noindex: true });
  return (
    <>
      <PageHeader title="My notifications" />
      <NotificationCentre />
    </>
  );
}

export function DashboardSearchPage() {
  useSeo({ title: 'Search', noindex: true });
  const [q, setQ] = useState('');
  const debounced = useDebounce(q.trim(), 300);
  const state = useApi(debounced.length >= 2 ? `/admin/search${qs({ q: debounced })}` : null);
  const d = state.data;
  const Section = ({ title, items, render }) => (items?.length ? <Card><CardHeader title={title} /><ul className="divide-y divide-slate-100">{items.map(render)}</ul></Card> : null);
  return (
    <>
      <PageHeader title="Search" description="Search players, users, news and teams you have access to." />
      <div className="relative mb-6 max-w-xl">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" aria-label="Search" placeholder="Type a name, email or headline" />
      </div>
      {d && (
        <div className="grid gap-4 lg:grid-cols-2">
          {Section({ title: 'Players', items: d.players, render: (p) => <li key={p.id}><Link to={`/dashboard/players/${p.id}`} className="block px-4 py-2 hover:bg-slate-50">{p.fullName} <span className="text-sm text-slate-500">{p.team?.name}</span></Link></li> })}
          {Section({ title: 'Users', items: d.users, render: (u) => <li key={u.id}><Link to={`/dashboard/users/${u.id}`} className="block px-4 py-2 hover:bg-slate-50">{u.name} <span className="text-sm text-slate-500">{u.email}</span></Link></li> })}
          {Section({ title: 'News', items: d.news, render: (n) => <li key={n.id}><Link to={`/dashboard/news/${n.id}`} className="block px-4 py-2 hover:bg-slate-50">{n.title} <StatusBadge status={n.status} /></Link></li> })}
          {Section({ title: 'Teams', items: d.teams, render: (t) => <li key={t.id}><Link to={`/teams/${t.slug}`} className="block px-4 py-2 hover:bg-slate-50">{t.name}</Link></li> })}
          {!Object.values(d).some((x) => x?.length) && <EmptyState icon={Search} title="Nothing found" />}
        </div>
      )}
    </>
  );
}


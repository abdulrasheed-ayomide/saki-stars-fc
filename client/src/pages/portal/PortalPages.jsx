import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { CalendarDays, CheckCircle2, Circle, ExternalLink, FileText, Megaphone, Trash2, Trophy, Upload, Users } from 'lucide-react';
import { useApi, qs } from '../../hooks/useApi.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { apiRequest, uploadFile } from '../../services/apiClient.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { AsyncContent, EmptyState, Alert, SkeletonList } from '../../components/ui/Feedback.jsx';
import { Field, Input, Select } from '../../components/ui/Field.jsx';
import { Button, ButtonLink, IconButton } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { FormError } from '../../components/ui/FormError.jsx';
import { useForm } from '../../components/ui/useForm.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { MatchCard, MatchRow } from '../../components/football/MatchCard.jsx';
import { PlayerCard, PlayerPhoto } from '../../components/football/PlayerCard.jsx';
import { StatGrid } from '../../components/football/StatGrid.jsx';
import { FormGuide } from '../../components/football/StandingsTable.jsx';
import { StaffCard } from '../public/StaffPage.jsx';
import { NotificationCentre } from '../account/NotificationsPage.jsx';
import { formatDate, timeAgo, toDateInput } from '../../lib/format.js';
import { Markdown } from '../../lib/markdown.jsx';
import { userMessage } from '../../lib/errors.js';

function Completion({ completion }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Profile completion</h2>
        <span className="text-lg font-bold text-brand-900">{completion.percent}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={completion.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completion">
        <div className="h-full bg-brand-700" style={{ width: `${completion.percent}%` }} />
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        {completion.items.map((i) => (
          <li key={i.key} className="flex items-center gap-2">
            {i.done ? <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-600" /> : <Circle aria-hidden="true" className="size-4 text-slate-400" />}
            <span className={i.done ? 'text-slate-600' : 'font-medium text-slate-900'}>{i.label}</span>
          </li>
        ))}
      </ul>
      {completion.percent < 100 && (
        <ButtonLink to="/portal/profile" variant="secondary" size="sm" className="mt-3">
          Complete my profile
        </ButtonLink>
      )}
    </Card>
  );
}

export function PortalHome() {
  useSeo({ title: 'Player Portal', noindex: true });
  const state = useApi('/portal/overview');
  return (
    <AsyncContent state={state} loading={<SkeletonList rows={4} />}>
      {(d) => (
        <>
          <PageHeader title={`Welcome, ${d.player.firstName}`} description={d.team ? `${d.team.name} · ${d.player.position}${d.player.jerseyNumber ? ` · #${d.player.jerseyNumber}` : ''}` : 'You have not been assigned to a team yet.'} />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="min-w-0 space-y-4 lg:col-span-2">
              <Card>
                <CardHeader title="Next matches" actions={<Link to="/portal/matches" className="inline-flex min-h-10 items-center text-sm font-semibold text-brand-700 underline">All matches</Link>} />
                <div className="grid gap-3 p-4 md:grid-cols-2">
                  {d.nextMatches.length ? d.nextMatches.map((m) => <MatchCard key={m.id} match={m} />) : <p className="text-sm text-slate-600">No upcoming matches for your team.</p>}
                </div>
              </Card>
              <Card>
                <CardHeader title={d.season ? `My statistics · ${d.season.name}` : 'My statistics'} actions={<Link to="/portal/stats" className="inline-flex min-h-10 items-center text-sm font-semibold text-brand-700 underline">All seasons</Link>} />
                <div className="p-4">{d.seasonStats ? <StatGrid stats={d.seasonStats} /> : <p className="text-sm text-slate-600">No season has started yet.</p>}</div>
              </Card>
              <Card>
                <CardHeader title="Recent results" />
                {d.recentResults.length ? (
                  <div className="divide-y divide-slate-100">
                    {d.recentResults.map((m) => (
                      <MatchRow key={m.id} match={m} />
                    ))}
                  </div>
                ) : (
                  <p className="p-4 text-sm text-slate-600">No results yet.</p>
                )}
              </Card>
            </div>
            <div className="min-w-0 space-y-4">
              <Completion completion={d.profileCompletion} />
              <Card className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold">Announcements</h2>
                  {d.unreadNotifications > 0 && <Badge tone="warning">{d.unreadNotifications} unread notifications</Badge>}
                </div>
                {d.announcements.length ? (
                  <ul className="mt-3 space-y-3 text-sm">
                    {d.announcements.map((a) => (
                      <li key={a.id}>
                        <p className="font-medium">{a.title}</p>
                        <p className="line-clamp-2 text-slate-600">{a.body}</p>
                        <p className="text-xs text-slate-500">{timeAgo(a.createdAt)}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">No announcements.</p>
                )}
                <Link to="/portal/announcements" className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-brand-700 underline">
                  All announcements
                </Link>
              </Card>
            </div>
          </div>
        </>
      )}
    </AsyncContent>
  );
}

export function PortalProfile() {
  useSeo({ title: 'My profile', noindex: true });
  const state = useApi('/portal/profile');
  const { notify } = useToast();
  return (
    <>
      <PageHeader title="My profile" description="Your official football details are managed by the club. You can keep your personal contact details up to date." />
      <AsyncContent state={state}>
        {(p) => (
          <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
            <Card className="p-4">
              <PlayerPhoto player={p} className="aspect-[4/5] w-full rounded-md" width={400} />
              <dl className="mt-3 space-y-1 text-sm">
                {[
                  ['Name', p.fullName],
                  ['Position', p.detailedPosition || p.position],
                  ['Shirt number', p.jerseyNumber ?? '–'],
                  ['Team', p.team?.name || 'Not assigned'],
                  ['Nationality', p.nationality || '–'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-slate-500">To change your team, position, number or photo, speak to your Team Manager.</p>
              {p.showOnWebsite && (
                <ButtonLink to={`/players/${p.slug}`} variant="outline" size="sm" icon={ExternalLink} className="mt-3">
                  View public profile
                </ButtonLink>
              )}
            </Card>
            <PersonalForm player={p} onSaved={(fresh) => { state.setData(fresh); notify('Your details have been saved.'); }} />
          </div>
        )}
      </AsyncContent>
    </>
  );
}

function PersonalForm({ player, onSaved }) {
  const pers = player.personal;
  const form = useForm({
    phone: pers.phone,
    email: pers.email,
    address: pers.address,
    dateOfBirth: toDateInput(pers.dateOfBirth),
    emergencyContact: { name: pers.emergencyContact?.name || '', relationship: pers.emergencyContact?.relationship || '', phone: pers.emergencyContact?.phone || '' },
    guardian: { phone: pers.guardian?.phone || '', email: pers.guardian?.email || '' },
  });
  const { values: v, set, errors: e } = form;
  const onSubmit = form.submit(async (values) => {
    const body = { ...values };
    if (!body.dateOfBirth || pers.dateOfBirth) delete body.dateOfBirth;
    if (!player.isMinor) delete body.guardian;
    onSaved(await apiRequest('/portal/personal', { method: 'PATCH', body }));
  });
  return (
    <Card className="p-4">
      <h2 className="font-semibold">Personal information</h2>
      <p className="mt-1 text-sm text-slate-600">Private: only you and authorised club staff can see this.</p>
      <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
        <FormError error={form.formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" error={e.phone}>
            <Input type="tel" value={v.phone} onChange={set('phone')} autoComplete="tel" maxLength={40} />
          </Field>
          <Field label="Contact email" error={e.email}>
            <Input type="email" value={v.email} onChange={set('email')} autoComplete="email" maxLength={254} />
          </Field>
          <Field label="Home address" error={e.address} className="sm:col-span-2">
            <Input value={v.address} onChange={set('address')} autoComplete="street-address" maxLength={400} />
          </Field>
          <Field label="Date of birth" error={e.dateOfBirth} hint={pers.dateOfBirth ? 'Already on file. Ask the club to correct it.' : 'Can be added once.'}>
            <Input type="date" value={v.dateOfBirth} onChange={set('dateOfBirth')} disabled={Boolean(pers.dateOfBirth)} />
          </Field>
        </div>
        <fieldset className="rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-sm font-semibold">Emergency contact</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name" error={e['emergencyContact.name']}>
              <Input value={v.emergencyContact.name} onChange={set('emergencyContact.name')} maxLength={120} />
            </Field>
            <Field label="Relationship" error={e['emergencyContact.relationship']}>
              <Input value={v.emergencyContact.relationship} onChange={set('emergencyContact.relationship')} maxLength={60} />
            </Field>
            <Field label="Phone" error={e['emergencyContact.phone']}>
              <Input type="tel" value={v.emergencyContact.phone} onChange={set('emergencyContact.phone')} maxLength={40} />
            </Field>
          </div>
        </fieldset>
        {player.isMinor && (
          <fieldset className="rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-sm font-semibold">Parent / guardian contact ({pers.guardian?.name || 'on file'})</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Guardian phone" error={e['guardian.phone']}>
                <Input type="tel" value={v.guardian.phone} onChange={set('guardian.phone')} maxLength={40} />
              </Field>
              <Field label="Guardian email" error={e['guardian.email']}>
                <Input type="email" value={v.guardian.email} onChange={set('guardian.email')} maxLength={254} />
              </Field>
            </div>
          </fieldset>
        )}
        <Button type="submit" loading={form.submitting}>
          Save my details
        </Button>
      </form>
    </Card>
  );
}

export function PortalTeam() {
  useSeo({ title: 'My team', noindex: true });
  const state = useApi('/portal/team');
  return (
    <AsyncContent state={state} isEmpty={(d) => !d} empty={<EmptyState icon={Users} title="You have not been assigned to a team yet">Your Team Manager will add you to a squad.</EmptyState>}>
      {(d) => (
        <>
          <PageHeader title={d.team.name} description={[d.team.category, d.team.ageGroup, d.team.homeVenue].filter(Boolean).join(' · ')} />
          {d.record.played > 0 && (
            <Card className="mb-6 p-4">
              <p className="text-sm font-semibold text-slate-600">{d.record.season ? `Season ${d.record.season.name}` : 'Record'}</p>
              <p className="mt-1 text-lg">
                P {d.record.played} · W {d.record.won} · D {d.record.drawn} · L {d.record.lost} · Goals {d.record.goalsFor}–{d.record.goalsAgainst}
              </p>
              <div className="mt-2">
                <FormGuide form={d.record.form} />
              </div>
            </Card>
          )}
          {d.staff.length > 0 && (
            <>
              <h2 className="mb-3 text-lg font-semibold">Team staff</h2>
              <ul className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {d.staff.map((s) => (
                  <li key={s.id}>
                    <StaffCard staff={s} />
                  </li>
                ))}
              </ul>
            </>
          )}
          <h2 className="mb-3 text-lg font-semibold">Squad</h2>
          <ul className="grid grid-cols-1 gap-4 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {d.squad.map((p) => (
              <li key={p.id}>
                <PlayerCard player={p} />
              </li>
            ))}
          </ul>
        </>
      )}
    </AsyncContent>
  );
}

export function PortalMatches() {
  useSeo({ title: 'My matches', noindex: true });
  const [type, setType] = useState('upcoming');
  const state = useApi(`/portal/matches${qs({ type })}`);
  return (
    <>
      <PageHeader title="Matches" />
      <Tabs label="Match type" value={type} onChange={setType} tabs={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'results', label: 'Results' }]} className="mb-4" />
      <AsyncContent state={state} isEmpty={(d) => !d.length} empty={<EmptyState icon={CalendarDays} title={type === 'upcoming' ? 'No upcoming matches' : 'No results yet'} />}>
        {(list) => (
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {list.map((m) => (
              <div key={m.id} className="relative">
                <MatchRow match={m} />
                {m.played && <Badge tone="success" className="absolute right-2 top-2">You played</Badge>}
              </div>
            ))}
          </div>
        )}
      </AsyncContent>
    </>
  );
}

export function PortalStats() {
  useSeo({ title: 'My statistics', noindex: true });
  const state = useApi('/portal/stats');
  return (
    <>
      <PageHeader title="Statistics" description="Calculated from the club's recorded match data. Official statistics can only be changed by club staff." />
      <AsyncContent state={state}>
        {(d) => (
          <div className="space-y-6">
            <Card className="p-4">
              <h2 className="mb-3 font-semibold">Career at the club</h2>
              <StatGrid stats={d.career} />
            </Card>
            {d.seasons.length ? (
              d.seasons.map((s) => (
                <Card key={s.season.id} className="p-4">
                  <h2 className="mb-3 font-semibold">Season {s.season.name}</h2>
                  <StatGrid stats={s} />
                </Card>
              ))
            ) : (
              <EmptyState icon={Trophy} title="No match appearances recorded yet" />
            )}
          </div>
        )}
      </AsyncContent>
    </>
  );
}

export function PortalAnnouncements() {
  useSeo({ title: 'Announcements', noindex: true });
  const state = useApi('/notifications/announcements');
  return (
    <>
      <PageHeader title="Announcements" description="Messages from the club to players and your team." />
      <AsyncContent state={state} isEmpty={(d) => !d.length} empty={<EmptyState icon={Megaphone} title="No announcements yet" />}>
        {(list) => (
          <ul className="space-y-3">
            {list.map((a) => (
              <li key={a.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold">{a.title}</h2>
                    <span className="text-xs text-slate-500">
                      {formatDate(a.createdAt)}
                      {a.team ? ` · ${a.team.name}` : ''}
                    </span>
                  </div>
                  <Markdown text={a.body} className="mt-2 text-sm" />
                  {a.createdBy && <p className="mt-2 text-xs text-slate-500">From {a.createdBy}</p>}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </AsyncContent>
    </>
  );
}

export function PortalNotifications() {
  useSeo({ title: 'Notifications', noindex: true });
  return (
    <>
      <PageHeader title="Notifications" />
      <NotificationCentre />
    </>
  );
}

const DOC_KINDS = [
  ['consent', 'Parent/guardian consent form'],
  ['registration', 'Registration form'],
  ['id', 'Identity document'],
  ['medical', 'Medical form'],
  ['other', 'Other'],
];

export function PortalDocuments() {
  useSeo({ title: 'Documents', noindex: true });
  const state = useApi('/portal/profile');
  const { notify } = useToast();
  const input = useRef(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('registration');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [remove, setRemove] = useState(null);

  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadFile('/portal/documents', file, { name: name || file.name.slice(0, 150), kind });
      setName('');
      notify('Document uploaded securely.');
      state.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function open(doc) {
    try {
      const { url } = await apiRequest(`/portal/documents/${doc.id}`);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    }
  }

  async function confirmRemove() {
    try {
      await apiRequest(`/portal/documents/${remove.id}`, { method: 'DELETE' });
      notify('Document removed.');
      state.reload();
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    } finally {
      setRemove(null);
    }
  }

  return (
    <>
      <PageHeader title="Documents & forms" description="Upload forms the club asks for. Files are stored privately and can only be opened by you and authorised staff." />
      <Card className="mb-6 p-4">
        <h2 className="font-semibold">Upload a document</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
          <Field label="Document name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} placeholder="e.g. Signed consent form" />
          </Field>
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              {DOC_KINDS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Button icon={Upload} loading={busy} onClick={() => input.current?.click()}>
            Choose file
          </Button>
          <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={upload} />
        </div>
        <p className="mt-2 text-xs text-slate-500">PDF, JPG or PNG, up to 10 MB.</p>
        {error && <Alert tone="error" className="mt-3">{userMessage(error, 'upload')}</Alert>}
      </Card>
      <AsyncContent state={state} isEmpty={(p) => !p.personal.documents.length} empty={<EmptyState icon={FileText} title="No documents uploaded" />}>
        {(p) => (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {p.personal.documents.map((d) => (
              <li key={d.id} className="flex items-center gap-3 p-3">
                <FileText aria-hidden="true" className="size-5 shrink-0 text-slate-500" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{d.name}</p>
                  <p className="text-xs text-slate-500">
                    {DOC_KINDS.find(([k]) => k === d.kind)?.[1]} · {formatDate(d.uploadedAt)}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => open(d)}>
                  Open
                </Button>
                <IconButton label="Remove document" icon={Trash2} onClick={() => setRemove(d)} />
              </li>
            ))}
          </ul>
        )}
      </AsyncContent>
      <ConfirmDialog open={Boolean(remove)} onClose={() => setRemove(null)} onConfirm={confirmRemove} title="Remove document?" confirmLabel="Remove">
        Documents added by the club can only be removed by the club.
      </ConfirmDialog>
    </>
  );
}


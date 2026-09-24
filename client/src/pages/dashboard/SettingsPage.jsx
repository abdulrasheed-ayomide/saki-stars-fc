import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useApi } from '../../hooks/useApi.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { useSettings } from '../../app/SettingsProvider.jsx';
import { apiRequest } from '../../services/apiClient.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { AsyncContent, Alert } from '../../components/ui/Feedback.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Field, Input, Textarea, Checkbox, Select } from '../../components/ui/Field.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { MediaUpload } from '../../components/ui/ImageUpload.jsx';
import { FormError } from '../../components/ui/FormError.jsx';
import { useForm } from '../../components/ui/useForm.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { Markdown } from '../../lib/markdown.jsx';
import { formatDateTime } from '../../lib/format.js';

const TIMEZONES = ['Africa/Lagos', 'Africa/Accra', 'Africa/Abidjan', 'Africa/Johannesburg', 'Africa/Nairobi', 'Africa/Cairo', 'Europe/London', 'UTC'];

/** Everything the public website says about the club comes from here. */
export default function SettingsPage() {
  useSeo({ title: 'Club settings', noindex: true });
  const state = useApi('/admin/settings');
  const [tab, setTab] = useState('identity');
  return (
    <>
      <PageHeader title="Club settings" description="Club identity, website content, contact details and legal documents. Changes appear on the website within a minute." />
      <Tabs label="Settings" value={tab} onChange={setTab} tabs={[{ value: 'identity', label: 'Club & website' }, { value: 'legal', label: 'Legal documents' }]} className="mb-4" />
      <AsyncContent state={state}>{(s) => (tab === 'identity' ? <IdentityForm key={s.updatedAt} settings={s} onSaved={state.reload} /> : <LegalEditor settings={s} onSaved={state.reload} />)}</AsyncContent>
    </>
  );
}

function IdentityForm({ settings: s, onSaved }) {
  const { notify } = useToast();
  const { reload: reloadPublic } = useSettings();
  const form = useForm({
    name: s.name,
    shortName: s.shortName,
    tagline: s.tagline || '',
    heroHeadline: s.heroHeadline || '',
    heroText: s.heroText || '',
    logo: s.logo || null,
    heroImage: s.heroImage || null,
    founded: s.founded || '',
    about: s.about || '',
    history: s.history || '',
    mission: s.mission || '',
    vision: s.vision || '',
    values: s.values || [],
    honours: s.honours || [],
    stadium: { name: s.stadium?.name || '', address: s.stadium?.address || '', capacity: s.stadium?.capacity ?? '', description: s.stadium?.description || '', mapUrl: s.stadium?.mapUrl || '', image: s.stadium?.image || null },
    contact: { email: s.contact?.email || '', phone: s.contact?.phone || '', address: s.contact?.address || '', officeHours: s.contact?.officeHours || '' },
    social: { facebook: s.social?.facebook || '', instagram: s.social?.instagram || '', x: s.social?.x || '', youtube: s.social?.youtube || '', tiktok: s.social?.tiktok || '' },
    seo: { title: s.seo?.title || '', description: s.seo?.description || '', image: s.seo?.image || null },
    timezone: s.timezone || 'Africa/Lagos',
    features: { comments: s.features?.comments !== false, newsletter: s.features?.newsletter !== false, playerApplications: s.features?.playerApplications !== false, staffApplications: s.features?.staffApplications !== false },
  });
  const { values: v, set, errors: e } = form;
  const onSubmit = form.submit(async (values) => {
    await apiRequest('/admin/settings', {
      method: 'PUT',
      body: {
        ...values,
        logo: values.logo || null,
        heroImage: values.heroImage || null,
        stadium: { ...values.stadium, capacity: values.stadium.capacity === '' ? null : Number(values.stadium.capacity), image: values.stadium.image || null },
        seo: { ...values.seo, image: values.seo.image || null },
      },
    });
    notify('Club settings saved.');
    onSaved();
    reloadPublic();
  });
  const listUpdate = (key, i, patch) => set(key)(v[key].map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError error={form.formError} />
      <Card>
        <CardHeader title="Identity" />
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <Field label="Club name" required error={e.name}><Input value={v.name} onChange={set('name')} maxLength={120} /></Field>
          <Field label="Short name" required error={e.shortName}><Input value={v.shortName} onChange={set('shortName')} maxLength={40} /></Field>
          <Field label="Tagline" error={e.tagline}><Input value={v.tagline} onChange={set('tagline')} maxLength={200} /></Field>
          <Field label="Founded" error={e.founded}><Input value={v.founded} onChange={set('founded')} maxLength={20} /></Field>
          <Field label="Time zone" error={e.timezone} hint="Kick-off times are shown in this time zone."><Select value={v.timezone} onChange={set('timezone')}>{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <div className="grid gap-4 xs:grid-cols-2 md:col-span-2">
            <MediaUpload label="Club crest / logo" folder="club" value={v.logo} onChange={set('logo')} aspect="aspect-square" />
            <MediaUpload label="Homepage hero image" folder="club" value={v.heroImage} onChange={set('heroImage')} />
          </div>
          <Field label="Homepage headline" error={e.heroHeadline} hint="Leave empty to show the club name."><Input value={v.heroHeadline} onChange={set('heroHeadline')} maxLength={200} /></Field>
          <Field label="Homepage introduction" error={e.heroText}><Textarea value={v.heroText} onChange={set('heroText')} rows={2} maxLength={600} /></Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Club page" description="Formatting: ## Heading, - list, **bold**." />
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <Field label="About" className="md:col-span-2"><Textarea value={v.about} onChange={set('about')} rows={5} maxLength={10000} /></Field>
          <Field label="History" className="md:col-span-2"><Textarea value={v.history} onChange={set('history')} rows={6} maxLength={20000} /></Field>
          <Field label="Mission"><Textarea value={v.mission} onChange={set('mission')} rows={3} maxLength={2000} /></Field>
          <Field label="Vision"><Textarea value={v.vision} onChange={set('vision')} rows={3} maxLength={2000} /></Field>
        </div>
        <div className="border-t border-slate-100 p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Values</h3><Button size="sm" variant="outline" icon={Plus} onClick={() => set('values')([...v.values, { title: '', description: '' }])}>Add value</Button></div>
          <ul className="mt-2 space-y-2">
            {v.values.map((val, i) => (
              <li key={i} className="grid gap-2 sm:grid-cols-[12rem_1fr_auto]">
                <Input aria-label="Value title" value={val.title} onChange={(ev) => listUpdate('values', i, { title: ev.target.value })} placeholder="e.g. Respect" maxLength={80} />
                <Input aria-label="Value description" value={val.description} onChange={(ev) => listUpdate('values', i, { description: ev.target.value })} maxLength={600} />
                <IconButton label="Remove value" icon={Trash2} onClick={() => set('values')(v.values.filter((_, j) => j !== i))} />
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t border-slate-100 p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Honours</h3><Button size="sm" variant="outline" icon={Plus} onClick={() => set('honours')([...v.honours, { title: '', competition: '', years: '' }])}>Add honour</Button></div>
          <ul className="mt-2 space-y-2">
            {v.honours.map((h, i) => (
              <li key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_10rem_auto]">
                <Input aria-label="Honour" value={h.title} onChange={(ev) => listUpdate('honours', i, { title: ev.target.value })} placeholder="e.g. League champions" maxLength={150} />
                <Input aria-label="Competition" value={h.competition} onChange={(ev) => listUpdate('honours', i, { competition: ev.target.value })} placeholder="Competition" maxLength={150} />
                <Input aria-label="Years" value={h.years} onChange={(ev) => listUpdate('honours', i, { years: ev.target.value })} placeholder="Years" maxLength={200} />
                <IconButton label="Remove honour" icon={Trash2} onClick={() => set('honours')(v.honours.filter((_, j) => j !== i))} />
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card>
        <CardHeader title="Stadium" />
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <Field label="Name"><Input value={v.stadium.name} onChange={set('stadium.name')} maxLength={150} /></Field>
          <Field label="Capacity"><Input type="number" min={0} value={v.stadium.capacity} onChange={set('stadium.capacity')} /></Field>
          <Field label="Address"><Input value={v.stadium.address} onChange={set('stadium.address')} maxLength={300} /></Field>
          <Field label="Map link" error={e['stadium.mapUrl']} hint="https:// link to Google Maps or similar"><Input value={v.stadium.mapUrl} onChange={set('stadium.mapUrl')} maxLength={500} /></Field>
          <Field label="Description" className="md:col-span-2"><Textarea value={v.stadium.description} onChange={set('stadium.description')} rows={3} maxLength={3000} /></Field>
          <MediaUpload label="Stadium photo" folder="club" value={v.stadium.image} onChange={set('stadium.image')} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Contact & social media" />
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <Field label="Public email" error={e['contact.email']}><Input type="email" value={v.contact.email} onChange={set('contact.email')} maxLength={254} /></Field>
          <Field label="Phone"><Input value={v.contact.phone} onChange={set('contact.phone')} maxLength={40} /></Field>
          <Field label="Address"><Input value={v.contact.address} onChange={set('contact.address')} maxLength={300} /></Field>
          <Field label="Office hours"><Input value={v.contact.officeHours} onChange={set('contact.officeHours')} maxLength={200} /></Field>
          {[['facebook', 'Facebook'], ['instagram', 'Instagram'], ['x', 'X (Twitter)'], ['youtube', 'YouTube'], ['tiktok', 'TikTok']].map(([k, l]) => (
            <Field key={k} label={`${l} link`} error={e[`social.${k}`]}><Input value={v.social[k]} onChange={set(`social.${k}`)} placeholder="https://" maxLength={300} /></Field>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Search engines & sharing" />
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <Field label="Website title"><Input value={v.seo.title} onChange={set('seo.title')} maxLength={120} /></Field>
          <Field label="Website description"><Textarea value={v.seo.description} onChange={set('seo.description')} rows={2} maxLength={300} /></Field>
          <MediaUpload label="Sharing image (social media preview)" folder="club" value={v.seo.image} onChange={set('seo.image')} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Features" />
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Checkbox checked={v.features.comments} onChange={set('features.comments')} label="Comments on news and matches" />
          <Checkbox checked={v.features.newsletter} onChange={set('features.newsletter')} label="Email updates sign-up" />
          <Checkbox checked={v.features.playerApplications} onChange={set('features.playerApplications')} label="Accept player applications" />
          <Checkbox checked={v.features.staffApplications} onChange={set('features.staffApplications')} label="Accept staff applications" />
        </div>
      </Card>

      <Button type="submit" size="lg" loading={form.submitting}>Save settings</Button>
    </form>
  );
}

const DOCS = [
  ['privacy', 'Privacy Policy'],
  ['terms', 'Terms of Use'],
  ['cookies', 'Cookie Policy'],
];

function LegalEditor({ settings, onSaved }) {
  const [doc, setDoc] = useState('privacy');
  return (
    <>
      <Alert tone="warning" className="mb-4" title="Use club-approved wording">
        The website does not write legal text for the club. Paste the documents approved by the club (ideally reviewed by a lawyer familiar with the Nigeria Data Protection Act 2023). Give each change a new version number: signed-in users are asked to accept the new version.
      </Alert>
      <Tabs label="Document" value={doc} onChange={setDoc} tabs={DOCS.map(([value, label]) => ({ value, label }))} className="mb-4" />
      <LegalDocForm key={doc + (settings.legal?.[doc]?.updatedAt || '')} doc={doc} current={settings.legal?.[doc] || {}} onSaved={onSaved} />
    </>
  );
}

function LegalDocForm({ doc, current, onSaved }) {
  const { notify } = useToast();
  const [preview, setPreview] = useState(false);
  const form = useForm({ body: current.body || '', version: current.version || '1.0', approved: Boolean(current.approved) });
  const { values: v, set, errors: e } = form;
  const onSubmit = form.submit(async (values) => {
    await apiRequest(`/admin/settings/legal/${doc}`, { method: 'PUT', body: values });
    notify('Document saved.');
    onSaved();
  });
  return (
    <Card className="p-4">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError error={form.formError} />
        {current.updatedAt && <p className="text-sm text-slate-600">Current version {current.version}, updated {formatDateTime(current.updatedAt)}.</p>}
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr] sm:items-end">
          <Field label="Version" required error={e.version}><Input value={v.version} onChange={set('version')} maxLength={20} /></Field>
          <Checkbox checked={v.approved} onChange={set('approved')} label="This text has been approved by the club" hint="Unapproved documents show a 'draft' notice on the website." />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={preview ? 'outline' : 'secondary'} onClick={() => setPreview(false)}>Edit</Button>
          <Button size="sm" variant={preview ? 'secondary' : 'outline'} onClick={() => setPreview(true)}>Preview</Button>
        </div>
        {preview ? <div className="min-h-64 rounded-md border border-slate-200 p-4"><Markdown text={v.body || '_Empty._'} /></div> : <Field label="Text" error={e.body}><Textarea value={v.body} onChange={set('body')} rows={20} maxLength={60000} className="font-mono text-sm" /></Field>}
        <Button type="submit" loading={form.submitting}>Save document</Button>
      </form>
    </Card>
  );
}

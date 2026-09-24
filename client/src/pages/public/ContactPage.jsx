import { useRef, useState } from 'react';
import { CheckCircle2, Clock, Mail, MapPin, Phone } from 'lucide-react';
import { useSettings } from '../../app/SettingsProvider.jsx';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { apiRequest } from '../../services/apiClient.js';
import { PageBanner } from '../../components/layout/PageBanner.jsx';
import { Container } from '../../components/layout/Container.jsx';
import { Field, Input, Textarea } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';
import { FormError } from '../../components/ui/FormError.jsx';
import { useForm } from '../../components/ui/useForm.js';

const SOCIAL = [
  ['facebook', 'Facebook'],
  ['instagram', 'Instagram'],
  ['x', 'X (Twitter)'],
  ['youtube', 'YouTube'],
  ['tiktok', 'TikTok'],
];

/** Working contact form: validated, stored by the API, forwarded by email when configured. */
export default function ContactPage() {
  const { settings } = useSettings();
  const { user } = useAuth();
  useSeo({ title: 'Contact', description: `Contact ${settings.name}: address, phone, email and contact form.` });
  const startedAt = useRef(Date.now());
  const [sent, setSent] = useState(null);
  const form = useForm({ name: user?.name || '', email: user?.email || '', phone: '', subject: '', message: '', website: '' });
  const { values, set, errors } = form;
  const c = settings.contact || {};

  const onSubmit = form.submit(async (v) => {
    const res = await apiRequest('/contact', { method: 'POST', body: { ...v, startedAt: startedAt.current } });
    setSent(res.message);
    form.setValues({ name: v.name, email: v.email, phone: '', subject: '', message: '', website: '' });
  });

  return (
    <>
      <PageBanner eyebrow="Contact" title="Get in touch" description="Questions about tickets, trials, partnerships or anything else? Send us a message." />
      <Container className="grid gap-10 py-10 lg:grid-cols-[2fr_3fr]">
        <section aria-labelledby="details-h" className="min-w-0 space-y-4">
          <h2 id="details-h" className="text-xl font-bold text-brand-900">
            Club contact details
          </h2>
          <ul className="space-y-3 text-slate-700">
            {c.address && (
              <li className="flex gap-3">
                <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-700" />
                <span>{c.address}</span>
              </li>
            )}
            {c.phone && (
              <li>
                <a href={`tel:${c.phone.replace(/\s+/g, '')}`} className="flex min-h-11 items-center gap-3 hover:underline">
                  <Phone aria-hidden="true" className="size-5 shrink-0 text-brand-700" />
                  {c.phone}
                </a>
              </li>
            )}
            {c.email && (
              <li>
                <a href={`mailto:${c.email}`} className="flex min-h-11 items-center gap-3 hover:underline">
                  <Mail aria-hidden="true" className="size-5 shrink-0 text-brand-700" />
                  {c.email}
                </a>
              </li>
            )}
            {c.officeHours && (
              <li className="flex gap-3">
                <Clock aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-700" />
                <span>{c.officeHours}</span>
              </li>
            )}
            {!c.address && !c.phone && !c.email && <li className="text-slate-600">Use the form to reach the club.</li>}
          </ul>
          {settings.stadium?.name && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="font-semibold text-brand-900">{settings.stadium.name}</p>
              {settings.stadium.address && <p className="text-slate-700">{settings.stadium.address}</p>}
              {settings.stadium.mapUrl && (
                <a href={settings.stadium.mapUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-10 items-center font-semibold text-brand-700 underline">
                  Directions
                </a>
              )}
            </div>
          )}
          {SOCIAL.some(([k]) => settings.social?.[k]) && (
            <div>
              <h3 className="font-semibold text-brand-900">Follow the club</h3>
              <ul className="mt-1 flex flex-wrap gap-x-4">
                {SOCIAL.filter(([k]) => settings.social?.[k]).map(([k, label]) => (
                  <li key={k}>
                    <a href={settings.social[k]} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center text-sm font-medium text-brand-700 underline">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section aria-labelledby="form-h" className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 id="form-h" className="text-xl font-bold text-brand-900">
            Send a message
          </h2>
          {sent ? (
            <div className="mt-4">
              <Alert tone="success" title="Message sent">
                {sent}
              </Alert>
              <Button variant="outline" className="mt-4" onClick={() => setSent(null)}>
                Send another message
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
              <FormError error={form.formError} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Your name" required error={errors.name}>
                  <Input value={values.name} onChange={set('name')} autoComplete="name" maxLength={120} />
                </Field>
                <Field label="Email address" required error={errors.email}>
                  <Input type="email" value={values.email} onChange={set('email')} autoComplete="email" maxLength={254} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Phone (optional)" error={errors.phone}>
                  <Input type="tel" value={values.phone} onChange={set('phone')} autoComplete="tel" maxLength={40} />
                </Field>
                <Field label="Subject" required error={errors.subject}>
                  <Input value={values.subject} onChange={set('subject')} maxLength={200} />
                </Field>
              </div>
              <Field label="Message" required error={errors.message} hint="At least 10 characters.">
                <Textarea value={values.message} onChange={set('message')} rows={6} maxLength={5000} />
              </Field>
              <div className="hidden" aria-hidden="true">
                <label>
                  Leave this empty
                  <input type="text" tabIndex={-1} autoComplete="off" value={values.website} onChange={set('website')} />
                </label>
              </div>
              <p className="text-xs text-slate-500">We use your details only to reply to your message. See our privacy policy.</p>
              <Button type="submit" loading={form.submitting} icon={CheckCircle2}>
                Send message
              </Button>
            </form>
          )}
        </section>
      </Container>
    </>
  );
}

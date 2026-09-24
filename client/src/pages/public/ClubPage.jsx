import { Award, Building2, Compass, Eye, MapPin, Target, Users } from 'lucide-react';
import { useSettings } from '../../app/SettingsProvider.jsx';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { useApi } from '../../hooks/useApi.js';
import { PageBanner } from '../../components/layout/PageBanner.jsx';
import { Container } from '../../components/layout/Container.jsx';
import { SectionHeading } from '../../components/ui/Card.jsx';
import { EmptyState, SkeletonGrid } from '../../components/ui/Feedback.jsx';
import { Markdown } from '../../lib/markdown.jsx';
import { imageUrl } from '../../lib/media.js';
import { StaffCard } from './StaffPage.jsx';

const SECTIONS = [
  ['about', 'About'],
  ['history', 'History'],
  ['mission', 'Mission & vision'],
  ['values', 'Values'],
  ['stadium', 'Stadium'],
  ['management', 'Management'],
  ['coaching', 'Coaching staff'],
  ['honours', 'Honours'],
];

/** Club information, all edited in Dashboard > Settings (nothing hard-coded here). */
export default function ClubPage() {
  const { settings, loaded } = useSettings();
  const staff = useApi('/staff');
  useSeo({ title: 'The Club', description: settings.about?.slice(0, 200) || `About ${settings.name}: history, mission, stadium, management and honours.` });
  const management = (staff.data || []).filter((s) => s.category === 'management');
  const coaching = (staff.data || []).filter((s) => s.category === 'coaching');
  const nothing = loaded && !settings.about && !settings.history && !settings.mission && !settings.vision;

  return (
    <>
      <PageBanner eyebrow={settings.founded ? `Founded ${settings.founded}` : 'The club'} title={settings.name} description={settings.tagline} />
      <nav aria-label="On this page" className="sticky top-14 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <Container className="relative overflow-x-auto">
          <ul className="flex min-w-max gap-1 py-1">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-900">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </Container>
      </nav>

      <Container className="space-y-14 py-10">
        {nothing && (
          <EmptyState icon={Building2} title="Club information is being prepared">
            The club&apos;s story, mission and stadium details will be published here.
          </EmptyState>
        )}

        <section id="about" aria-labelledby="about-h" className="scroll-mt-32">
          <SectionHeading id="about-h" title="About the club" />
          {settings.about ? <Markdown text={settings.about} className="max-w-3xl" /> : <p className="text-slate-600">No description has been published yet.</p>}
        </section>

        <section id="history" aria-labelledby="history-h" className="scroll-mt-32">
          <SectionHeading id="history-h" title="Our history" />
          {settings.history ? <Markdown text={settings.history} className="max-w-3xl" /> : <p className="text-slate-600">The club history will be published soon.</p>}
        </section>

        <section id="mission" aria-labelledby="mission-h" className="scroll-mt-32">
          <SectionHeading id="mission-h" title="Mission & vision" />
          <div className="grid gap-4 md:grid-cols-2">
            {[
              [Target, 'Mission', settings.mission],
              [Eye, 'Vision', settings.vision],
            ].map(([Icon, label, text]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                <h3 className="flex items-center gap-2 font-semibold text-brand-900">
                  <Icon aria-hidden="true" className="size-5" />
                  {label}
                </h3>
                <p className="mt-2 text-slate-700">{text || 'Not published yet.'}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="values" aria-labelledby="values-h" className="scroll-mt-32">
          <SectionHeading id="values-h" title="Our values" />
          {settings.values?.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {settings.values.map((v) => (
                <li key={v.title} className="rounded-lg border border-slate-200 p-5">
                  <h3 className="flex items-center gap-2 font-semibold text-brand-900">
                    <Compass aria-hidden="true" className="size-5" />
                    {v.title}
                  </h3>
                  {v.description && <p className="mt-2 text-sm text-slate-700">{v.description}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-600">The club values will be published soon.</p>
          )}
        </section>

        <section id="stadium" aria-labelledby="stadium-h" className="scroll-mt-32">
          <SectionHeading id="stadium-h" title={settings.stadium?.name || 'Stadium'} />
          <div className="grid gap-6 md:grid-cols-2">
            {settings.stadium?.image?.url && (
              <img src={imageUrl(settings.stadium.image.url, { width: 960, height: 540 })} alt={settings.stadium.image.alt || settings.stadium.name || 'Stadium'} loading="lazy" className="aspect-video w-full rounded-lg object-cover" />
            )}
            <div className="space-y-3">
              {settings.stadium?.description ? <Markdown text={settings.stadium.description} /> : <p className="text-slate-600">Stadium details will be published soon.</p>}
              <dl className="grid grid-cols-1 gap-3 xs:grid-cols-2">
                {settings.stadium?.address && (
                  <div>
                    <dt className="text-sm text-slate-500">Address</dt>
                    <dd className="flex gap-1 font-medium">
                      <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                      {settings.stadium.address}
                    </dd>
                  </div>
                )}
                {settings.stadium?.capacity ? (
                  <div>
                    <dt className="text-sm text-slate-500">Capacity</dt>
                    <dd className="font-medium">{new Intl.NumberFormat('en-GB').format(settings.stadium.capacity)}</dd>
                  </div>
                ) : null}
              </dl>
              {settings.stadium?.mapUrl && (
                <a href={settings.stadium.mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline">
                  Open in maps
                </a>
              )}
            </div>
          </div>
        </section>

        {[
          ['management', 'Management', management],
          ['coaching', 'Coaching staff', coaching],
        ].map(([id, title, list]) => (
          <section key={id} id={id} aria-labelledby={`${id}-h`} className="scroll-mt-32">
            <SectionHeading id={`${id}-h`} title={title} />
            {staff.loading && !staff.data ? (
              <SkeletonGrid items={3} itemClass="h-32" />
            ) : list.length ? (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((s) => (
                  <li key={s.id}>
                    <StaffCard staff={s} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={Users} title={`${title} profiles will be published here`} />
            )}
          </section>
        ))}

        <section id="honours" aria-labelledby="honours-h" className="scroll-mt-32">
          <SectionHeading id="honours-h" title="Honours" />
          {settings.honours?.length ? (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {settings.honours.map((h, i) => (
                <li key={i} className="flex gap-3 rounded-lg border border-slate-200 p-4">
                  <Award aria-hidden="true" className="size-6 shrink-0 text-amber-600" />
                  <div className="min-w-0">
                    <p className="font-semibold text-brand-900">{h.title}</p>
                    {h.competition && <p className="text-sm text-slate-600">{h.competition}</p>}
                    {h.years && <p className="text-sm text-slate-600">{h.years}</p>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-600">No honours have been recorded yet.</p>
          )}
        </section>
      </Container>
    </>
  );
}

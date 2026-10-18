import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, CalendarDays, Clock, MapPin, Newspaper, Trophy, Users } from 'lucide-react';
import { Container } from '../components/layout/Container.jsx';
import { useSettings } from '../app/SettingsProvider.jsx';
import { useSeo } from '../hooks/useDocumentTitle.js';
import { useApi } from '../hooks/useApi.js';
import { ButtonLink } from '../components/ui/Button.jsx';
import { SectionHeading } from '../components/ui/Card.jsx';
import { EmptyState, Skeleton, SkeletonGrid } from '../components/ui/Feedback.jsx';
import { TeamLogo, CompetitionLogo } from '../components/football/TeamLogo.jsx';
import { Countdown } from '../components/football/Countdown.jsx';
import { MatchCard, MatchResultExtras } from '../components/football/MatchCard.jsx';
import { StandingsTable } from '../components/football/StandingsTable.jsx';
import { PlayerCard } from '../components/football/PlayerCard.jsx';
import { NewsCard } from '../components/content/NewsCard.jsx';
import { VideoCard, VideoPlayer } from '../components/content/VideoCard.jsx';
import { NewsletterForm } from '../components/content/NewsletterForm.jsx';
import { Lightbox } from '../components/content/Lightbox.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { formatDateLong, formatTime } from '../lib/format.js';
import { imageUrl } from '../lib/media.js';
import { SafeImage, ImageUnavailable } from '../components/ui/SafeImage.jsx';

function Section({ id, className = '', children }) {
  return (
    <section aria-labelledby={id} className={`py-10 sm:py-14 ${className}`}>
      <Container>{children}</Container>
    </section>
  );
}

function MoreLink({ to, children }) {
  return (
    <Link to={to} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-900 hover:underline">
      {children}
      <ArrowRight aria-hidden="true" className="size-4" />
    </Link>
  );
}

function Hero() {
  const { settings } = useSettings();
  const bg = settings.heroImage?.url;
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-brand-900 text-white">
      {bg ? (
        <SafeImage src={imageUrl(bg, { width: 1920 })} alt="" className="absolute inset-0 -z-20 size-full object-cover" fetchPriority="high" />
      ) : (
        <svg aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full opacity-[0.07]" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1200 600">
          <g fill="none" stroke="currentColor" strokeWidth="3">
            <rect x="20" y="20" width="1160" height="560" />
            <line x1="600" y1="20" x2="600" y2="580" />
            <circle cx="600" cy="300" r="90" />
            <rect x="20" y="170" width="160" height="260" />
            <rect x="1020" y="170" width="160" height="260" />
          </g>
        </svg>
      )}
      <div aria-hidden="true" className={`absolute inset-0 -z-10 ${bg ? 'bg-brand-950/75' : 'bg-gradient-to-b from-brand-900 to-brand-950'}`} />

      <Container className="py-14 sm:py-20 lg:py-24">
        <div className="flex max-w-3xl flex-col gap-4">
          {settings.logo?.url && (
            <img
              src={imageUrl(settings.logo.url, { width: 160, height: 160, crop: 'pad' })}
              alt=""
              onError={(e) => {
                e.currentTarget.hidden = true;
              }}
              className="size-16 object-contain sm:size-20"
            />
          )}
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-200 xs:text-sm">{settings.heroHeadline ? settings.name : 'Official website'}</p>
          <h1 id="hero-title" className="text-[clamp(1.75rem,8vw,3.75rem)] font-bold leading-[1.1]">
            {settings.heroHeadline || settings.name}
          </h1>
          <p className="max-w-2xl text-base text-brand-100 sm:text-lg">{settings.heroText || 'Fixtures, results, teams, players and club news, all in one place.'}</p>
          <div className="mt-4 flex flex-col gap-3 xs:flex-row xs:flex-wrap">
            <ButtonLink to="/fixtures-results" variant="light" size="lg" icon={CalendarDays}>
              View Fixtures
            </ButtonLink>
            <ButtonLink to="/players" variant="outline-light" size="lg" icon={Users}>
              Meet the Players
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}

function NextMatch() {
  const { settings } = useSettings();
  const next = useApi('/matches/next');
  const latest = useApi('/matches/latest-result');
  const m = next.data;
  return (
    <Section id="matches-title" className="bg-white">
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="min-w-0">
          <SectionHeading id="matches-title" eyebrow="Next match" title="Match day" action={<MoreLink to="/fixtures-results">All fixtures</MoreLink>} />
          {next.loading && !m ? (
            <Skeleton className="h-64" />
          ) : m ? (
            <article className="overflow-hidden rounded-xl bg-brand-900 text-white shadow">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 text-sm">
                <span className="flex min-w-0 items-center gap-2 font-semibold">
                  <CompetitionLogo competition={m.competition} className="size-5" />
                  <span className="truncate">{m.competition?.name}</span>
                </span>
                {m.round && <span className="text-brand-200">{m.round}</span>}
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-6">
                <div className="flex min-w-0 flex-col items-center gap-2 text-center">
                  <TeamLogo team={m.homeTeam} size="lg" className="bg-white/90" />
                  <span className="line-clamp-2 font-semibold">{m.homeTeam?.name}</span>
                </div>
                <div className="text-center">
                  <span className="block text-2xl font-bold">{formatTime(m.kickoffAt, settings.timezone)}</span>
                  <span className="text-xs uppercase tracking-wide text-brand-200">Kick-off</span>
                </div>
                <div className="flex min-w-0 flex-col items-center gap-2 text-center">
                  <TeamLogo team={m.awayTeam} size="lg" className="bg-white/90" />
                  <span className="line-clamp-2 font-semibold">{m.awayTeam?.name}</span>
                </div>
              </div>
              <div className="flex flex-col gap-4 border-t border-white/10 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1 text-sm text-brand-100">
                  <p className="flex items-center gap-2">
                    <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
                    {formatDateLong(m.kickoffAt, settings.timezone)}
                  </p>
                  {m.venue && (
                    <p className="flex items-center gap-2">
                      <MapPin aria-hidden="true" className="size-4 shrink-0" />
                      {m.venue}
                    </p>
                  )}
                  <div className="pt-2">
                    <Countdown to={m.kickoffAt} />
                  </div>
                </div>
                <ButtonLink to={`/matches/${m.id}`} variant="light">
                  Match Centre
                </ButtonLink>
              </div>
            </article>
          ) : (
            <EmptyState icon={Clock} title="No upcoming match scheduled">
              The next fixture will appear here as soon as it is announced.
            </EmptyState>
          )}
        </div>

        <div className="min-w-0">
          <SectionHeading eyebrow="Latest result" title="Full time" action={<MoreLink to="/fixtures-results?status=completed">All results</MoreLink>} />
          {latest.loading && !latest.data ? (
            <Skeleton className="h-48" />
          ) : latest.data ? (
            <div className="space-y-3">
              <MatchCard match={latest.data} />
              <MatchResultExtras match={latest.data} />
            </div>
          ) : (
            <EmptyState icon={Trophy} title="No results yet">
              Results appear here after each match.
            </EmptyState>
          )}
        </div>
      </div>
    </Section>
  );
}

function LatestNews() {
  const news = useApi('/news?limit=4');
  const items = news.data?.items || [];
  return (
    <Section id="news-title" className="bg-slate-50">
      <SectionHeading id="news-title" eyebrow="News" title="Latest news" action={<MoreLink to="/news">All news</MoreLink>} />
      {news.loading && !news.data ? (
        <SkeletonGrid items={3} />
      ) : items.length ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="md:col-span-2 lg:col-span-3">
            <NewsCard article={items[0]} featured />
          </div>
          {items.slice(1).map((a) => (
            <NewsCard key={a.id} article={a} />
          ))}
        </div>
      ) : (
        <EmptyState icon={Newspaper} title="No news published yet">
          Club news will appear here.
        </EmptyState>
      )}
    </Section>
  );
}

// The landing page previews at most this many competitions, each with the top of its table.
// The full list stays on /competitions and every full table on the competition's own page.
const HOME_COMPETITIONS = 4;
const HOME_TABLE_ROWS = 5;

function CompetitionPreview({ competition: c }) {
  const table = useApi(`/competitions/${c.id}/standings`);
  const rows = table.data?.rows || [];
  const fullTable = `/competitions/${c.slug}?tab=table`;
  const shown = rows.slice(0, HOME_TABLE_ROWS);
  return (
    <article aria-labelledby={`comp-${c.id}`} className="flex w-full min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <header className="mb-3 flex min-w-0 items-center gap-3">
        <CompetitionLogo competition={c} className="size-9 shrink-0" />
        <div className="min-w-0">
          <h3 id={`comp-${c.id}`} className="truncate font-bold text-brand-900" title={c.name}>
            <Link to={`/competitions/${c.slug}`} className="hover:underline">
              {c.name}
            </Link>
          </h3>
          {table.data?.season && <p className="text-xs text-slate-500">Season {table.data.season.name}</p>}
        </div>
      </header>
      {table.loading && !table.data ? (
        <Skeleton className="h-56" />
      ) : table.error && !table.data ? (
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">The table could not be loaded right now.</p>
      ) : shown.length ? (
        <>
          <StandingsTable rows={shown} compact caption={`${c.name}: top ${shown.length} of ${rows.length}`} />
          <p className="mt-2 text-xs text-slate-500">
            {rows.length > shown.length ? `Top ${shown.length} of ${rows.length} teams.` : `All ${rows.length} team${rows.length === 1 ? '' : 's'}.`}
          </p>
        </>
      ) : (
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">The table will appear after the first results.</p>
      )}
      <div className="mt-auto pt-2">
        <MoreLink to={fullTable}>
          Full table<span className="sr-only">: {c.name}</span>
        </MoreLink>
      </div>
    </article>
  );
}

function Competitions() {
  const comps = useApi('/competitions');
  // Same order and visibility as the competitions page (the API's display order); league tables only.
  const leagues = (comps.data || []).filter((c) => c.type === 'league');
  const preview = leagues.slice(0, HOME_COMPETITIONS);
  if (comps.loading && !comps.data) return null;
  return (
    <Section id="standings-title" className="bg-white">
      <SectionHeading id="standings-title" eyebrow="Competitions" title="League tables" action={<MoreLink to="/competitions">View All Competitions</MoreLink>} />
      {comps.error && !comps.data ? (
        <EmptyState icon={Trophy} title="Competitions could not be loaded right now" />
      ) : !preview.length ? (
        <EmptyState icon={Trophy} title="No league table yet">
          Tables appear once the club&apos;s competitions and results are added.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {preview.map((c) => (
            <li key={c.id} className="flex min-w-0">
              <CompetitionPreview competition={c} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function TeamsAndPlayers() {
  const teams = useApi('/teams');
  const featured = useApi('/players?featured=true&limit=8');
  return (
    <Section id="teams-title" className="bg-slate-50">
      <SectionHeading id="teams-title" eyebrow="The club" title="Our teams" action={<MoreLink to="/teams">All teams</MoreLink>} />
      {teams.loading && !teams.data ? (
        <SkeletonGrid items={3} itemClass="h-24" />
      ) : teams.data?.length ? (
        <ul className="grid gap-3 xs:grid-cols-2 lg:grid-cols-4">
          {teams.data.map((t) => (
            <li key={t.id}>
              <Link to={`/teams/${t.slug}`} className="flex min-h-20 items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:border-brand-300">
                <TeamLogo team={t} size="lg" />
                <span className="min-w-0">
                  <span className="block font-semibold text-brand-900">{t.name}</span>
                  <span className="block text-sm text-slate-600">{[t.category, t.ageGroup].filter(Boolean).join(' · ')}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Users} title="Teams will be listed here" />
      )}

      {featured.data?.items?.length > 0 && (
        <div className="mt-10">
          <SectionHeading eyebrow="Squad" title="Featured players" action={<MoreLink to="/players">All players</MoreLink>} />
          <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 md:grid-cols-4">
            {featured.data.items.slice(0, 4).map((p) => (
              <PlayerCard key={p.id} player={p} />
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

function LatestVideos() {
  const videos = useApi('/videos?limit=3');
  const [playing, setPlaying] = useState(null);
  const items = videos.data?.items || [];
  if (!videos.loading && !items.length) return null;
  return (
    <Section id="videos-title" className="bg-brand-950 text-white">
      <SectionHeading id="videos-title" eyebrow="Club TV" title={<span className="text-white">Latest videos</span>} action={<Link to="/videos" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-100 hover:text-white hover:underline">All videos <ArrowRight aria-hidden="true" className="size-4" /></Link>} />
      {videos.loading && !videos.data ? (
        <SkeletonGrid items={3} itemClass="h-48 bg-white/10" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((v) => (
            <VideoCard key={v.id} video={v} onPlay={setPlaying} />
          ))}
        </div>
      )}
      <Modal open={Boolean(playing)} onClose={() => setPlaying(null)} title={playing?.title || ''} size="xl">
        {playing && <VideoPlayer video={playing} />}
      </Modal>
    </Section>
  );
}

function ClubStats() {
  const stats = useApi('/club-stats');
  const s = stats.data;
  if (!s) return null;
  const items = [
    ['Teams', s.teams],
    ['Registered players', s.players],
    ...(s.season?.played ? [[`Matches ${s.season.name}`, s.season.played], ['Wins', s.season.won], ['Goals scored', s.season.goalsScored], ['Clean sheets', s.season.cleanSheets]] : []),
    ...(s.honours ? [['Honours', s.honours]] : []),
    ...(s.founded ? [['Founded', s.founded]] : []),
  ];
  return (
    <Section id="stats-title" className="bg-white">
      <SectionHeading id="stats-title" eyebrow="By the numbers" title="Club statistics" />
      <dl className="grid grid-cols-1 gap-3 xs:grid-cols-2 md:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <dt className="text-sm text-slate-600">{label}</dt>
            <dd className="mt-1 text-3xl font-bold tabular-nums text-brand-900">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-slate-500">Figures come from the club&apos;s recorded data.</p>
    </Section>
  );
}

function GalleryPreview() {
  const gallery = useApi('/gallery?limit=6');
  const [index, setIndex] = useState(null);
  const items = gallery.data?.items || [];
  if (!gallery.loading && !items.length) return null;
  return (
    <Section id="gallery-title" className="bg-slate-50">
      <SectionHeading id="gallery-title" eyebrow="Gallery" title="In pictures" action={<MoreLink to="/gallery">Full gallery</MoreLink>} />
      {gallery.loading && !gallery.data ? (
        <SkeletonGrid items={6} className="grid-cols-2 md:grid-cols-3" itemClass="aspect-square" />
      ) : (
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {items.map((g, i) => (
            <li key={g.id}>
              <button type="button" onClick={() => setIndex(i)} className="block w-full overflow-hidden rounded-md" aria-label={`Open photo: ${g.title || g.caption || g.category}`}>
                <SafeImage src={imageUrl(g.image.url, { width: 480, height: 480 })} alt={g.image.alt || g.title || ''} loading="lazy" className="aspect-square w-full object-cover transition hover:opacity-90" fallback={<ImageUnavailable className="aspect-square w-full" />} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Lightbox items={items} index={index} onClose={() => setIndex(null)} onIndex={setIndex} />
    </Section>
  );
}

function ClubUpdates() {
  const { settings } = useSettings();
  if (settings.features?.newsletter === false) return null;
  return (
    <section aria-labelledby="updates-title" className="bg-brand-900 py-10 text-white sm:py-14">
      <Container className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-200">Club updates</p>
          <h2 id="updates-title" className="mt-1 text-2xl font-bold">
            Get club news in your inbox
          </h2>
          <p className="mt-2 text-brand-100">Fixtures, results and announcements. You can unsubscribe at any time.</p>
        </div>
        <NewsletterForm />
      </Container>
    </section>
  );
}

export default function HomePage() {
  useSeo({});
  return (
    <>
      <Hero />
      <NextMatch />
      <LatestNews />
      <Competitions />
      <TeamsAndPlayers />
      <LatestVideos />
      <ClubStats />
      <GalleryPreview />
      <ClubUpdates />
    </>
  );
}


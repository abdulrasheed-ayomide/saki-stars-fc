import { Link, useParams } from 'react-router';
import { ArrowRightLeft, CalendarDays, CircleDot, Clock, MapPin, Square, UserRound } from 'lucide-react';
import { useApi } from '../../hooks/useApi.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { useSettings } from '../../app/SettingsProvider.jsx';
import { Container } from '../../components/layout/Container.jsx';
import { Breadcrumbs } from '../../components/ui/PageHeader.jsx';
import { ErrorState, SkeletonList } from '../../components/ui/Feedback.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { SectionHeading } from '../../components/ui/Card.jsx';
import { TeamLogo, CompetitionLogo } from '../../components/football/TeamLogo.jsx';
import { Countdown } from '../../components/football/Countdown.jsx';
import { VideoPlayer } from '../../components/content/VideoCard.jsx';
import { Comments } from '../../components/content/Comments.jsx';
import { Markdown } from '../../lib/markdown.jsx';
import { formatDateLong, formatTime } from '../../lib/format.js';
import { EVENT_LABELS, MATCH_STATUS_LABELS } from '../../lib/labels.js';
import NotFoundPage from '../NotFoundPage.jsx';

const STAT_NAMES = { possession: 'Possession (%)', shots: 'Shots', shotsOnTarget: 'Shots on target', corners: 'Corners', fouls: 'Fouls', offsides: 'Offsides' };

function EventIcon({ type }) {
  if (['goal', 'penalty_goal', 'own_goal'].includes(type)) return <CircleDot aria-hidden="true" className="size-4 text-brand-800" />;
  if (type === 'yellow_card') return <Square aria-hidden="true" className="size-4 fill-amber-400 text-amber-500" />;
  if (type === 'red_card' || type === 'second_yellow') return <Square aria-hidden="true" className="size-4 fill-red-600 text-red-700" />;
  if (type === 'substitution') return <ArrowRightLeft aria-hidden="true" className="size-4 text-emerald-700" />;
  return <Clock aria-hidden="true" className="size-4 text-slate-500" />;
}

function PlayerName({ ref_, name }) {
  if (ref_?.slug) return <Link to={`/players/${ref_.slug}`} className="font-medium hover:underline">{name}</Link>;
  return <span className="font-medium">{name}</span>;
}

/** Match Centre. Completed-match details only appear once the match has been played. */
export default function MatchCentrePage() {
  const { id } = useParams();
  const { settings } = useSettings();
  const state = useApi(`/matches/${encodeURIComponent(id)}`);
  const m = state.data;
  const title = m ? `${m.homeTeam?.name} v ${m.awayTeam?.name}` : 'Match';
  useSeo({ title, description: m ? `${title}, ${m.competition?.name}, ${formatDateLong(m.kickoffAt, settings.timezone)}.` : undefined });

  if (state.error?.status === 404) return <NotFoundPage />;
  if (state.error && !m) return <Container className="py-10"><ErrorState error={state.error} onRetry={state.reload} /></Container>;
  if (!m) return <Container className="py-10"><SkeletonList rows={5} /></Container>;

  const played = m.status === 'completed' || (m.status === 'abandoned' && m.score);
  const upcoming = ['scheduled', 'postponed'].includes(m.status);
  const goals = m.events.filter((e) => ['goal', 'penalty_goal', 'own_goal'].includes(e.type));
  const scorerLine = (side) =>
    goals
      .filter((e) => (e.type === 'own_goal' ? e.side !== side : e.side === side))
      .map((e) => `${e.playerName} ${e.minute}'${e.type === 'penalty_goal' ? ' (pen)' : e.type === 'own_goal' ? ' (og)' : ''}`);

  return (
    <>
      <div className="bg-brand-900 text-white">
        <Container className="py-8">
          <div className="[&_a]:text-brand-200 [&_span]:text-brand-100 [&_ol]:text-brand-200">
            <Breadcrumbs items={[{ label: 'Fixtures & Results', to: '/fixtures-results' }, { label: title }]} />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm text-brand-100">
            <CompetitionLogo competition={m.competition} />
            <Link to={`/competitions/${m.competition?.slug}`} className="font-semibold hover:underline">
              {m.competition?.name}
            </Link>
            {m.round && <span>· {m.round}</span>}
            {m.season && <span>· {m.season.name}</span>}
          </div>
          <h1 className="sr-only">{title}</h1>
          <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-start gap-3">
            <div className="flex min-w-0 flex-col items-center gap-2 text-center">
              <TeamLogo team={m.homeTeam} size="xl" className="rounded-full bg-white p-1" />
              <p className="text-base font-bold sm:text-xl">{m.homeTeam?.name}</p>
              {played && <ul className="text-xs text-brand-100">{scorerLine('home').map((s, i) => <li key={i}>{s}</li>)}</ul>}
            </div>
            <div className="pt-4 text-center">
              {played ? (
                <p className="text-4xl font-bold tabular-nums sm:text-5xl">
                  {m.score.home}–{m.score.away}
                </p>
              ) : (
                <p className="text-3xl font-bold">{upcoming && m.status !== 'postponed' ? formatTime(m.kickoffAt, settings.timezone) : 'v'}</p>
              )}
              {m.score?.homePenalties != null && (
                <p className="text-sm text-brand-100">
                  {m.score.homePenalties}–{m.score.awayPenalties} on penalties
                </p>
              )}
              <div className="mt-2">
                <StatusBadge status={m.status} label={MATCH_STATUS_LABELS[m.status]} />
              </div>
            </div>
            <div className="flex min-w-0 flex-col items-center gap-2 text-center">
              <TeamLogo team={m.awayTeam} size="xl" className="rounded-full bg-white p-1" />
              <p className="text-base font-bold sm:text-xl">{m.awayTeam?.name}</p>
              {played && <ul className="text-xs text-brand-100">{scorerLine('away').map((s, i) => <li key={i}>{s}</li>)}</ul>}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-brand-100">
            <span className="flex items-center gap-2">
              <CalendarDays aria-hidden="true" className="size-4" />
              {formatDateLong(m.kickoffAt, settings.timezone)}, {formatTime(m.kickoffAt, settings.timezone)}
            </span>
            {m.venue && (
              <span className="flex items-center gap-2">
                <MapPin aria-hidden="true" className="size-4" />
                {m.venue}
              </span>
            )}
            {m.referee && (
              <span className="flex items-center gap-2">
                <UserRound aria-hidden="true" className="size-4" />
                Referee: {m.referee}
              </span>
            )}
          </div>
          {m.statusNote && <p className="mt-3 text-center text-sm text-amber-200">{m.statusNote}</p>}
          {m.status === 'scheduled' && (
            <div className="mt-6 flex justify-center">
              <Countdown to={m.kickoffAt} />
            </div>
          )}
        </Container>
      </div>

      <Container className="space-y-10 py-8">
        {played && (
          <>
            {m.events.length > 0 && (
              <section aria-labelledby="events-h">
                <SectionHeading id="events-h" title="Match events" />
                <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                  {m.events.map((e) => (
                    <li key={e.id} className={`flex items-center gap-3 px-3 py-2.5 text-sm ${e.side === 'away' ? 'flex-row-reverse text-right' : ''}`}>
                      <span className="w-12 shrink-0 text-center font-bold tabular-nums text-brand-900">
                        {e.minute}
                        {e.addedTime ? `+${e.addedTime}` : ''}&apos;
                      </span>
                      <EventIcon type={e.type} />
                      <span className="min-w-0">
                        {e.type === 'substitution' ? (
                          <>
                            <PlayerName ref_={e.player} name={e.playerName} /> on{e.playerOffName ? <> for <PlayerName ref_={e.playerOff} name={e.playerOffName} /></> : ''}
                          </>
                        ) : (
                          <>
                            <PlayerName ref_={e.player} name={e.playerName} />
                            <span className="text-slate-500"> · {EVENT_LABELS[e.type]}</span>
                            {e.assistName && <span className="block text-xs text-slate-500">Assist: {e.assistName}</span>}
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {m.stats && (
              <section aria-labelledby="stats-h">
                <SectionHeading id="stats-h" title="Match statistics" />
                <dl className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                  {Object.entries(m.stats).map(([key, v]) => {
                    const total = (v.home ?? 0) + (v.away ?? 0) || 1;
                    return (
                      <div key={key}>
                        <dt className="mb-1 flex justify-between text-sm">
                          <span className="font-bold tabular-nums">{v.home ?? '–'}</span>
                          <span className="text-slate-600">{STAT_NAMES[key] || key}</span>
                          <span className="font-bold tabular-nums">{v.away ?? '–'}</span>
                        </dt>
                        <dd className="flex h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                          <span className="bg-brand-800" style={{ width: `${((v.home ?? 0) / total) * 100}%` }} />
                          <span className="ml-auto bg-slate-400" style={{ width: `${((v.away ?? 0) / total) * 100}%` }} />
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
            )}

            {(m.lineups.home.length > 0 || m.lineups.away.length > 0) && (
              <section aria-labelledby="lineups-h">
                <SectionHeading id="lineups-h" title="Line-ups" />
                <div className="grid gap-4 md:grid-cols-2">
                  {['home', 'away'].map((side) =>
                    m.lineups[side].length ? (
                      <div key={side} className="rounded-lg border border-slate-200 bg-white p-4">
                        <h3 className="font-semibold text-brand-900">{m[`${side}Team`]?.name}</h3>
                        {[
                          ['Starting XI', true],
                          ['Substitutes', false],
                        ].map(([label, starter]) => {
                          const list = m.lineups[side].filter((l) => l.starter === starter);
                          if (!list.length) return null;
                          return (
                            <div key={label} className="mt-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                              <ul className="mt-1 space-y-1 text-sm">
                                {list.map((l) => (
                                  <li key={l.player.id} className="flex gap-2">
                                    <span className="w-6 text-right tabular-nums text-slate-500">{l.shirtNumber ?? ''}</span>
                                    <Link to={`/players/${l.player.slug}`} className="hover:underline">
                                      {l.player.name}
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    ) : null,
                  )}
                </div>
              </section>
            )}

            {m.report && (
              <section aria-labelledby="report-h">
                <SectionHeading id="report-h" title={m.report.title || 'Match report'} />
                <Markdown text={m.report.body} className="max-w-3xl" />
              </section>
            )}

            {m.highlightsVideo && (
              <section aria-labelledby="hl-h">
                <SectionHeading id="hl-h" title="Highlights" />
                <div className="max-w-3xl">
                  <VideoPlayer video={m.highlightsVideo} />
                </div>
              </section>
            )}
          </>
        )}

        {upcoming && (
          <section aria-labelledby="info-h" className="rounded-lg border border-slate-200 bg-slate-50 p-5">
            <h2 id="info-h" className="text-lg font-bold text-brand-900">
              Match information
            </h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-slate-500">Competition</dt>
                <dd className="font-medium">{m.competition?.name}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">Venue</dt>
                <dd className="font-medium">{m.venue || 'To be confirmed'}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">Date</dt>
                <dd className="font-medium">{formatDateLong(m.kickoffAt, settings.timezone)}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">Kick-off</dt>
                <dd className="font-medium">
                  {formatTime(m.kickoffAt, settings.timezone)} ({settings.timezone.replace('_', ' ')})
                </dd>
              </div>
            </dl>
          </section>
        )}

        <Comments targetType="match" targetId={m.id} />
      </Container>
    </>
  );
}

import { Link } from 'react-router';
import { MapPin } from 'lucide-react';
import { TeamLogo, CompetitionLogo } from './TeamLogo.jsx';
import { StatusBadge } from '../ui/Badge.jsx';
import { formatDay, formatTime } from '../../lib/format.js';
import { MATCH_STATUS_LABELS } from '../../lib/labels.js';
import { useSettings } from '../../app/SettingsProvider.jsx';

export function Scoreline({ match, className = '' }) {
  const { settings } = useSettings();
  if (match.score && match.score.home != null) {
    return (
      <div className={`text-center ${className}`}>
        <span className="text-2xl font-bold tabular-nums text-brand-900">
          {match.score.home}<span className="mx-1 text-slate-400">–</span>{match.score.away}
        </span>
        {match.score.homePenalties != null && (
          <span className="block text-xs text-slate-600">
            ({match.score.homePenalties}–{match.score.awayPenalties} pens)
          </span>
        )}
      </div>
    );
  }
  return (
    <div className={`text-center ${className}`}>
      <span className="block text-lg font-bold text-brand-900">{['postponed', 'cancelled'].includes(match.status) ? '–' : formatTime(match.kickoffAt, settings.timezone)}</span>
    </div>
  );
}

/** One fixture/result as a card: competition, date, teams, score or kick-off, venue. */
export function MatchCard({ match, className = '' }) {
  const { settings } = useSettings();
  return (
    <Link to={`/matches/${match.id}`} className={`group block rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:border-brand-300 hover:shadow ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span className="flex min-w-0 items-center gap-1.5 font-semibold uppercase tracking-wide text-brand-700">
          <CompetitionLogo competition={match.competition} className="size-4" />
          <span className="truncate">{match.competition?.shortName || match.competition?.name}</span>
        </span>
        <span className="flex items-center gap-2">
          {formatDay(match.kickoffAt, settings.timezone)}
          {match.status !== 'scheduled' && <StatusBadge status={match.status} label={MATCH_STATUS_LABELS[match.status]} />}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TeamSide team={match.homeTeam} />
        <Scoreline match={match} className="min-w-16" />
        <TeamSide team={match.awayTeam} align="right" />
      </div>
      {match.venue && (
        <p className="mt-2 flex items-center justify-center gap-1 text-xs text-slate-500">
          <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{match.venue}</span>
        </p>
      )}
    </Link>
  );
}

function TeamSide({ team, align = 'left' }) {
  return (
    <div className={`flex min-w-0 flex-col items-center gap-1 text-center`}>
      <TeamLogo team={team} size="md" />
      <span className={`line-clamp-2 text-sm font-semibold ${team?.isClubTeam ? 'text-brand-900' : 'text-slate-800'}`} data-align={align}>
        {team?.name}
      </span>
    </div>
  );
}

/** Compact row for long fixture lists. */
export function MatchRow({ match }) {
  const { settings } = useSettings();
  return (
    <Link to={`/matches/${match.id}`} className="grid grid-cols-1 gap-2 px-3 py-3 hover:bg-brand-50/50 sm:grid-cols-[8rem_1fr] sm:items-center">
      <div className="text-xs text-slate-600">
        <span className="block font-semibold text-slate-800">{formatDay(match.kickoffAt, settings.timezone)}</span>
        <span className="block truncate">{match.competition?.shortName || match.competition?.name}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span className="flex min-w-0 items-center justify-end gap-2 text-right text-sm font-semibold">
          <span className="line-clamp-2">{match.homeTeam?.name}</span>
          <TeamLogo team={match.homeTeam} size="sm" />
        </span>
        <span className="min-w-14 rounded bg-brand-900 px-2 py-1 text-center text-sm font-bold tabular-nums text-white">
          {match.score && match.score.home != null ? `${match.score.home}–${match.score.away}` : ['postponed', 'cancelled'].includes(match.status) ? MATCH_STATUS_LABELS[match.status].slice(0, 4) : formatTime(match.kickoffAt, settings.timezone)}
        </span>
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <TeamLogo team={match.awayTeam} size="sm" />
          <span className="line-clamp-2">{match.awayTeam?.name}</span>
        </span>
      </div>
    </Link>
  );
}

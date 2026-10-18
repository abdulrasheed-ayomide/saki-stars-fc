import { Link } from 'react-router';
import { SoccerBallIcon, FootballBootIcon } from './MatchIcons.jsx';

export const GOAL_TYPES = ['goal', 'penalty_goal', 'own_goal'];

/** The side a goal counts for (an own goal counts for the other team). */
export function goalSide(e) {
  if (e.type !== 'own_goal') return e.side;
  return e.side === 'home' ? 'away' : 'home';
}

function minuteLabel(e) {
  return `${e.minute}${e.addedTime ? `+${e.addedTime}` : ''}'`;
}

function Name({ person, name }) {
  if (person?.slug) {
    return (
      <Link to={`/players/${person.slug}`} className="[overflow-wrap:anywhere] hover:underline">
        {name}
      </Link>
    );
  }
  return <span className="[overflow-wrap:anywhere]">{name}</span>;
}

/**
 * One goal: a soccer-ball icon before the scorer and, when recorded, a boot icon before the
 * player who assisted. Icons come from the event type and field (scorer = `player`,
 * assist = `assist`), never from the stored names. Screen readers hear "Goal:" / "Assist:".
 */
export function GoalLine({ event: e, align = 'left', tone = 'light' }) {
  // Centred lines (Match Centre header) keep the icon inline with the first word when names wrap.
  const center = align === 'center';
  const layout = align === 'right' ? 'flex-row-reverse text-right' : '';
  const muted = tone === 'dark' ? 'text-brand-100' : 'text-slate-500';
  const icon = tone === 'dark' ? 'text-white' : 'text-brand-800';
  const row = center ? 'min-w-0 text-center' : `flex min-w-0 items-start gap-1.5 ${layout}`;
  const iconPlace = center ? 'mr-1 inline-block align-[-0.2em]' : '';
  const suffix = e.type === 'penalty_goal' ? ' (pen)' : e.type === 'own_goal' ? ' (og)' : '';
  return (
    <div className="min-w-0">
      <p className={row} title="Goal">
        <SoccerBallIcon className={`${center ? iconPlace : 'mt-0.5'} size-4 ${icon}`} />
        <span className="min-w-0">
          <span className="sr-only">Goal: </span>
          <span className="font-medium">
            <Name person={e.player} name={e.playerName || 'Unknown scorer'} />
          </span>
          <span className={muted}>
            {' '}
            {minuteLabel(e)}
            {suffix}
          </span>
        </span>
      </p>
      {e.assistName && (
        <p className={`${row} mt-0.5 text-xs ${muted}`} title="Assist">
          <FootballBootIcon className={`${center ? iconPlace : 'mt-px'} size-3.5 ${icon}`} />
          <span className="min-w-0">
            <span className="sr-only">Assist: </span>
            <Name person={e.assist} name={e.assistName} />
          </span>
        </p>
      )}
    </div>
  );
}

/** Goals for one side, in match order. */
export function SideGoals({ events = [], side, align, tone, className = '' }) {
  const goals = events.filter((e) => GOAL_TYPES.includes(e.type) && goalSide(e) === side);
  if (!goals.length) return null;
  return (
    <ul className={`space-y-1.5 ${className}`}>
      {goals.map((e) => (
        <li key={e.id}>
          <GoalLine event={e} align={align} tone={tone} />
        </li>
      ))}
    </ul>
  );
}

/** Scorers and assists for both teams, home on the left and away on the right. */
export function MatchScorers({ match, className = '' }) {
  const events = match?.events || [];
  if (!events.some((e) => GOAL_TYPES.includes(e.type))) return null;
  return (
    <div className={`grid grid-cols-2 gap-3 text-sm ${className}`}>
      <div className="min-w-0">
        <p className="sr-only">{match.homeTeam?.name} goals</p>
        <SideGoals events={events} side="home" />
      </div>
      <div className="min-w-0">
        <p className="sr-only">{match.awayTeam?.name} goals</p>
        <SideGoals events={events} side="away" align="right" />
      </div>
    </div>
  );
}

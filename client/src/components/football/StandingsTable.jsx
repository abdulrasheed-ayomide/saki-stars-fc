import { Link } from 'react-router';
import { TeamLogo } from './TeamLogo.jsx';

const FORM = { W: 'bg-emerald-600', D: 'bg-slate-400', L: 'bg-red-600' };

export function FormGuide({ form = [] }) {
  if (!form.length) return <span className="text-slate-400">–</span>;
  return (
    <span className="flex gap-1" aria-label={`Last ${form.length}: ${form.map((f) => ({ W: 'win', D: 'draw', L: 'loss' })[f]).join(', ')}`}>
      {form.map((f, i) => (
        <span key={i} aria-hidden="true" className={`grid size-5 place-items-center rounded-sm text-[10px] font-bold text-white ${FORM[f]}`}>
          {f}
        </span>
      ))}
    </span>
  );
}

/** League table calculated by the server from results. */
export function StandingsTable({ rows, compact = false, highlightClub = true }) {
  return (
    <div className="relative overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className={`w-full border-collapse text-sm ${compact ? 'min-w-[22rem]' : 'min-w-[40rem]'}`}>
        <caption className="sr-only">League table</caption>
        <thead className="whitespace-nowrap bg-brand-900 text-xs uppercase tracking-wide text-white">
          <tr>
            <th scope="col" className="w-12 whitespace-nowrap px-2 py-2 text-center" title="Position">
              Pos
            </th>
            <th scope="col" className="min-w-[11rem] px-2 py-2 text-left">
              Team
            </th>
            <th scope="col" className="px-2 py-2 text-center" title="Played">P</th>
            {!compact && (
              <>
                <th scope="col" className="px-2 py-2 text-center" title="Won">W</th>
                <th scope="col" className="px-2 py-2 text-center" title="Drawn">D</th>
                <th scope="col" className="px-2 py-2 text-center" title="Lost">L</th>
                <th scope="col" className="px-2 py-2 text-center" title="Goals for">GF</th>
                <th scope="col" className="px-2 py-2 text-center" title="Goals against">GA</th>
              </>
            )}
            <th scope="col" className="px-2 py-2 text-center" title="Goal difference">GD</th>
            <th scope="col" className="px-2 py-2 text-center" title="Points">Pts</th>
            {!compact && (
              <th scope="col" className="px-2 py-2 text-left">
                Form
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.team.id} className={highlightClub && r.team.isClubTeam ? 'bg-brand-50 font-semibold' : ''}>
              <td className="px-2 py-2 text-center tabular-nums">{r.position}</td>
              <th scope="row" className="px-2 py-2 text-left font-medium">
                <span className="flex min-w-0 items-center gap-2 leading-snug">
                  <TeamLogo team={r.team} size="sm" />
                  <span className="min-w-0">
                    {r.team.isClubTeam ? (
                      <Link to={`/teams/${r.team.slug}`} className="block py-2 hover:underline">
                        {r.team.name}
                      </Link>
                    ) : (
                      <span className="block">{r.team.name}</span>
                    )}
                    {r.adjustment && (
                      <span className="block whitespace-nowrap text-xs font-normal text-amber-700" title={r.adjustment.reasons.join('; ')}>
                        {r.adjustment.points > 0 ? '+' : ''}
                        {r.adjustment.points} pts adjustment*
                      </span>
                    )}
                  </span>
                </span>
              </th>
              <td className="px-2 py-2 text-center tabular-nums">{r.played}</td>
              {!compact && (
                <>
                  <td className="px-2 py-2 text-center tabular-nums">{r.won}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{r.drawn}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{r.lost}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{r.goalsFor}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{r.goalsAgainst}</td>
                </>
              )}
              <td className="px-2 py-2 text-center tabular-nums">{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</td>
              <td className="px-2 py-2 text-center font-bold tabular-nums">{r.points}</td>
              {!compact && (
                <td className="whitespace-nowrap px-2 py-2">
                  <FormGuide form={r.form} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

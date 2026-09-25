import { Link } from 'react-router';
import { Trophy } from 'lucide-react';
import { useApi } from '../../hooks/useApi.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { PageBanner } from '../../components/layout/PageBanner.jsx';
import { Container } from '../../components/layout/Container.jsx';
import { AsyncContent, EmptyState, SkeletonGrid } from '../../components/ui/Feedback.jsx';
import { CompetitionLogo } from '../../components/football/TeamLogo.jsx';
import { Badge } from '../../components/ui/Badge.jsx';

export default function CompetitionsPage() {
  useSeo({ title: 'Competitions', description: 'Leagues and cups the club competes in, with tables, fixtures and results.' });
  const state = useApi('/competitions');
  return (
    <>
      <PageBanner eyebrow="Competitions" title="Where we compete" />
      <Container className="py-8">
        <AsyncContent state={state} context="competitions" loading={<SkeletonGrid items={3} itemClass="h-40" />} isEmpty={(d) => !d.length} empty={<EmptyState icon={Trophy} title="No competitions have been added yet" />}>
          {(list) => (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((c) => (
                <li key={c.id}>
                  <Link to={`/competitions/${c.slug}`} className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-300 hover:shadow">
                    <div className="flex items-center gap-3">
                      {c.logo ? <CompetitionLogo competition={c} className="size-12" /> : <Trophy aria-hidden="true" className="size-10 text-brand-300" />}
                      <div className="min-w-0">
                        <h2 className="text-lg font-bold text-brand-900">{c.name}</h2>
                        <p className="text-sm text-slate-600">{c.organizer}</p>
                      </div>
                    </div>
                    {c.description && <p className="mt-3 line-clamp-3 text-sm text-slate-700">{c.description}</p>}
                    <div className="mt-auto flex flex-wrap gap-2 pt-3">
                      <Badge tone="brand">{c.type === 'league' ? 'League' : c.type === 'cup' ? 'Cup' : 'Friendlies'}</Badge>
                      {c.currentSeason && <Badge>{c.currentSeason.name}</Badge>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </AsyncContent>
      </Container>
    </>
  );
}

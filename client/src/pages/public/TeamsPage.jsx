import { Link } from 'react-router';
import { Users } from 'lucide-react';
import { useApi } from '../../hooks/useApi.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { PageBanner } from '../../components/layout/PageBanner.jsx';
import { Container } from '../../components/layout/Container.jsx';
import { AsyncContent, EmptyState, SkeletonGrid } from '../../components/ui/Feedback.jsx';
import { TeamLogo } from '../../components/football/TeamLogo.jsx';

export default function TeamsPage() {
  useSeo({ title: 'Teams', description: 'All club teams, from the first team to youth squads.' });
  const state = useApi('/teams');
  return (
    <>
      <PageBanner eyebrow="Teams" title="Our teams" description="Every squad that represents the club." />
      <Container className="py-8">
        <AsyncContent state={state} context="teams" loading={<SkeletonGrid items={3} itemClass="h-48" />} isEmpty={(d) => !d.length} empty={<EmptyState icon={Users} title="No teams have been added yet" />}>
          {(teams) => (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {teams.map((t) => (
                <li key={t.id}>
                  <Link to={`/teams/${t.slug}`} className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-300 hover:shadow">
                    <div className="flex items-center gap-3">
                      <TeamLogo team={t} size="lg" />
                      <div className="min-w-0">
                        <h2 className="text-lg font-bold text-brand-900">{t.name}</h2>
                        <p className="text-sm text-slate-600">{[t.category, t.ageGroup].filter(Boolean).join(' · ')}</p>
                      </div>
                    </div>
                    {t.description && <p className="mt-3 line-clamp-3 text-sm text-slate-700">{t.description}</p>}
                    {t.competitions?.length > 0 && <p className="mt-auto pt-3 text-xs font-medium text-brand-700">{t.competitions.map((c) => c.shortName || c.name).join(' · ')}</p>}
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

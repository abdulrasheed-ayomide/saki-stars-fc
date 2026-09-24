import { Link } from 'react-router';
import { CalendarDays, History, Trophy } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { AsyncContent, EmptyState, SkeletonGrid } from '../../components/ui/Feedback.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { MatchRow } from '../../components/football/MatchCard.jsx';
import { Stat } from './shared.jsx';
import { timeAgo } from '../../lib/format.js';

const CARDS = [
  ['pendingPlayerApplications', 'Player applications waiting', '/dashboard/applications?tab=players', 'attention'],
  ['pendingStaffApplications', 'Staff applications waiting', '/dashboard/applications?tab=staff', 'attention'],
  ['resultsToRecord', 'Results to record', '/dashboard/matches?status=upcoming', 'attention'],
  ['newsInReview', 'Articles waiting for review', '/dashboard/news?status=review', 'attention'],
  ['commentsToModerate', 'Comments to moderate', '/dashboard/comments', 'attention'],
  ['reportsToReview', 'Reports to review', '/dashboard/reports?status=submitted', 'attention'],
  ['unreadMessages', 'New contact messages', '/dashboard/contact', 'attention'],
  ['deletionRequests', 'Deletion requests', '/dashboard/users?deletionRequested=true', 'attention'],
  ['activePlayers', 'Active players', '/dashboard/players'],
  ['teams', 'Club teams', '/dashboard/teams'],
  ['activeStaff', 'Active staff', '/dashboard/staff'],
  ['users', 'User accounts', '/dashboard/users'],
  ['newsDrafts', 'Draft articles', '/dashboard/news?status=draft'],
  ['myDrafts', 'My draft articles', '/dashboard/news?status=draft'],
  ['videos', 'Published videos', '/dashboard/videos'],
  ['galleryImages', 'Gallery photos', '/dashboard/gallery'],
  ['failedLogins24h', 'Failed sign-ins (24 h)', '/dashboard/audit?action=auth.login_failed'],
];

/** Real, permission-limited numbers from the database. An empty club shows zeros, not invented figures. */
export default function OverviewPage() {
  useSeo({ title: 'Dashboard', noindex: true });
  const { user } = useAuth();
  const state = useApi('/admin/dashboard/overview');
  return (
    <>
      <PageHeader title="Overview" description={`${user.staff.roleLabel} dashboard. You see the areas your role gives you access to.`} />
      <AsyncContent state={state} loading={<SkeletonGrid items={8} className="grid-cols-1 xs:grid-cols-2 lg:grid-cols-4" itemClass="h-24" />}>
        {(d) => (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-4">
              {CARDS.filter(([key]) => d.cards[key] !== undefined).map(([key, label, to, tone]) => (
                <Stat key={key} label={label} value={d.cards[key]} to={to} tone={tone} />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader title="Upcoming fixtures" actions={<Link to="/fixtures-results" className="inline-flex min-h-10 items-center text-sm font-semibold text-brand-700 underline">Public fixtures</Link>} />
                {d.lists.upcomingFixtures?.length ? (
                  <div className="divide-y divide-slate-100">{d.lists.upcomingFixtures.map((m) => <MatchRow key={m.id} match={m} />)}</div>
                ) : (
                  <div className="p-4">
                    <EmptyState icon={CalendarDays} title="No upcoming fixtures" />
                  </div>
                )}
              </Card>
              <Card>
                <CardHeader title="Recent results" />
                {d.lists.recentResults?.length ? (
                  <div className="divide-y divide-slate-100">{d.lists.recentResults.map((m) => <MatchRow key={m.id} match={m} />)}</div>
                ) : (
                  <div className="p-4">
                    <EmptyState icon={Trophy} title="No results recorded yet" />
                  </div>
                )}
              </Card>
              {d.lists.recentReports && (
                <Card>
                  <CardHeader title="Recent staff reports" actions={<Link to="/dashboard/reports" className="inline-flex min-h-10 items-center text-sm font-semibold text-brand-700 underline">All reports</Link>} />
                  {d.lists.recentReports.length ? (
                    <ul className="divide-y divide-slate-100">
                      {d.lists.recentReports.map((r) => (
                        <li key={r.id}>
                          <Link to={`/dashboard/reports/${r.id}`} className="block px-4 py-2.5 hover:bg-slate-50">
                            <p className="font-medium">{r.title}</p>
                            <p className="text-xs text-slate-500">
                              {r.authorName} · {r.type} · {timeAgo(r.createdAt)}
                            </p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="p-4 text-sm text-slate-600">No reports waiting.</p>
                  )}
                </Card>
              )}
              {d.lists.recentActivity && (
                <Card>
                  <CardHeader title="Recent activity" actions={<Link to="/dashboard/audit" className="inline-flex min-h-10 items-center text-sm font-semibold text-brand-700 underline">Audit log</Link>} />
                  {d.lists.recentActivity.length ? (
                    <ul className="divide-y divide-slate-100 text-sm">
                      {d.lists.recentActivity.map((a) => (
                        <li key={a.id} className="flex items-center gap-2 px-4 py-2">
                          <History aria-hidden="true" className="size-4 shrink-0 text-slate-400" />
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-medium">{a.actorName || 'System'}</span> · {a.action}
                          </span>
                          <StatusBadge status={a.status} />
                          <span className="shrink-0 text-xs text-slate-500">{timeAgo(a.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="p-4 text-sm text-slate-600">No activity yet.</p>
                  )}
                </Card>
              )}
            </div>
          </div>
        )}
      </AsyncContent>
    </>
  );
}

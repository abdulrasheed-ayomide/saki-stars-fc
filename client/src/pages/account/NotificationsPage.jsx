import { useState } from 'react';
import { Link } from 'react-router';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { useApi, qs } from '../../hooks/useApi.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { apiRequest } from '../../services/apiClient.js';
import { notificationsChanged } from '../../hooks/useUnreadCount.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { AsyncContent, EmptyState } from '../../components/ui/Feedback.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { timeAgo } from '../../lib/format.js';

/** Notification centre: unread count, mark as read, open the related page. */
export function NotificationCentre() {
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const state = useApi(`/notifications${qs({ unread: tab === 'unread' ? 'true' : '', page })}`);

  async function markRead(n) {
    if (n.readAt) return;
    await apiRequest(`/notifications/${n.id}/read`, { method: 'POST' });
    state.setData((d) => ({ ...d, unread: Math.max(0, d.unread - 1), items: d.items.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) }));
    notificationsChanged();
  }
  async function readAll() {
    await apiRequest('/notifications/read-all', { method: 'POST' });
    state.reload();
    notificationsChanged();
  }
  async function remove(n) {
    await apiRequest(`/notifications/${n.id}`, { method: 'DELETE' });
    state.reload();
    notificationsChanged();
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <Tabs
          label="Filter"
          value={tab}
          onChange={(v) => {
            setTab(v);
            setPage(1);
          }}
          tabs={[
            { value: 'all', label: 'All' },
            { value: 'unread', label: 'Unread', count: state.data?.unread },
          ]}
          className="min-w-0 flex-1"
        />
        <Button variant="outline" size="sm" icon={CheckCheck} onClick={readAll} disabled={!state.data?.unread}>
          Mark all as read
        </Button>
      </div>
      <AsyncContent state={state} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={Bell} title={tab === 'unread' ? 'No unread notifications' : 'No notifications yet'} />}>
        {(d) => (
          <>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {d.items.map((n) => (
                <li key={n.id} className={`flex items-start gap-3 p-3 ${n.readAt ? '' : 'bg-brand-50/60'}`}>
                  <span aria-hidden="true" className={`mt-2 size-2 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : 'bg-brand-600'}`} />
                  <div className="min-w-0 flex-1">
                    {n.link ? (
                      <Link to={n.link} onClick={() => markRead(n)} className="font-semibold text-slate-900 hover:underline">
                        {n.title}
                      </Link>
                    ) : (
                      <button type="button" onClick={() => markRead(n)} className="text-left font-semibold text-slate-900">
                        {n.title}
                      </button>
                    )}
                    {n.body && <p className="mt-0.5 whitespace-pre-line text-sm text-slate-700">{n.body}</p>}
                    <p className="mt-1 text-xs text-slate-500">
                      {timeAgo(n.createdAt)}
                      {!n.readAt && ' · Unread'}
                    </p>
                  </div>
                  <IconButton label="Delete notification" icon={Trash2} onClick={() => remove(n)} />
                </li>
              ))}
            </ul>
            <Pagination page={d.page} pages={d.pages} onChange={setPage} className="mt-4" />
          </>
        )}
      </AsyncContent>
    </>
  );
}

export default function NotificationsPage() {
  useSeo({ title: 'Notifications', noindex: true });
  return (
    <>
      <PageHeader title="Notifications" description="Updates about your account, applications, matches and club announcements." />
      <NotificationCentre />
    </>
  );
}

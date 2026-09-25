import { useState } from 'react';
import { UserRound, Users } from 'lucide-react';
import { useApi } from '../../hooks/useApi.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { PageBanner } from '../../components/layout/PageBanner.jsx';
import { Container } from '../../components/layout/Container.jsx';
import { AsyncContent, EmptyState, SkeletonGrid } from '../../components/ui/Feedback.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { imageUrl } from '../../lib/media.js';
import { formatMonthYear } from '../../lib/format.js';

export function StaffCard({ staff, onOpen }) {
  const Tag = onOpen ? 'button' : 'div';
  return (
    <Tag type={onOpen ? 'button' : undefined} onClick={onOpen ? () => onOpen(staff) : undefined} className="flex w-full items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-brand-300">
      {staff.photo?.url ? (
        <img src={imageUrl(staff.photo.url, { width: 160, height: 160 })} alt="" loading="lazy" className="size-20 shrink-0 rounded-full object-cover object-top" />
      ) : (
        <span aria-hidden="true" className="grid size-20 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700">
          <UserRound className="size-8" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block font-semibold text-brand-900">{staff.fullName}</span>
        <span className="block text-sm text-slate-600">{staff.title}</span>
        {(staff.department || staff.team) && <span className="block text-xs text-slate-500">{[staff.department, staff.team?.name].filter(Boolean).join(' · ')}</span>}
      </span>
    </Tag>
  );
}

const TABS = [
  { value: 'all', label: 'All staff' },
  { value: 'management', label: 'Management' },
  { value: 'coaching', label: 'Coaching' },
  { value: 'operations', label: 'Operations' },
  { value: 'medical', label: 'Medical' },
];

/** Public staff profiles. Only people the club has chosen to show are listed. */
export default function StaffPage() {
  useSeo({ title: 'Staff', description: 'Meet the people who run the club: management, coaching and operations staff.' });
  const [tab, setTab] = useState('all');
  const [open, setOpen] = useState(null);
  const state = useApi('/staff');
  return (
    <>
      <PageBanner eyebrow="Club staff" title="Our people" description="The management, coaching and operations team behind the club." />
      <Container className="py-8">
        <Tabs tabs={TABS} value={tab} onChange={setTab} label="Staff groups" className="mb-6" />
        <AsyncContent state={state} context="staff" loading={<SkeletonGrid items={6} itemClass="h-28" />}>
          {(list) => {
            const shown = tab === 'all' ? list : list.filter((s) => s.category === tab);
            return shown.length ? (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((s) => (
                  <li key={s.id}>
                    <StaffCard staff={s} onOpen={setOpen} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={Users} title="No staff profiles published in this group yet" />
            );
          }}
        </AsyncContent>
      </Container>
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open?.fullName || ''} description={open?.title} size="lg">
        {open && (
          <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
            {open.photo?.url && <img src={imageUrl(open.photo.url, { width: 320, height: 400 })} alt={open.photo.alt || open.fullName} className="w-40 rounded-lg object-cover" />}
            <div className="min-w-0 space-y-3 text-sm text-slate-700">
              {(open.department || open.team) && <p className="font-medium text-slate-900">{[open.department, open.team?.name].filter(Boolean).join(' · ')}</p>}
              {open.bio && <p className="whitespace-pre-line">{open.bio}</p>}
              {open.background && (
                <div>
                  <h3 className="font-semibold text-brand-900">Professional background</h3>
                  <p className="whitespace-pre-line">{open.background}</p>
                </div>
              )}
              {open.dateJoined && <p className="text-slate-500">Joined the club: {formatMonthYear(open.dateJoined)}</p>}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

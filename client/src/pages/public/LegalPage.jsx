import { FileText } from 'lucide-react';
import { useApi } from '../../hooks/useApi.js';
import { useSeo } from '../../hooks/useDocumentTitle.js';
import { useSettings } from '../../app/SettingsProvider.jsx';
import { PageBanner } from '../../components/layout/PageBanner.jsx';
import { Container } from '../../components/layout/Container.jsx';
import { Alert, AsyncContent, EmptyState, SkeletonList } from '../../components/ui/Feedback.jsx';
import { Markdown } from '../../lib/markdown.jsx';
import { formatDate } from '../../lib/format.js';

const TITLES = { terms: 'Terms of Use', privacy: 'Privacy Policy', cookies: 'Cookie Policy' };

/**
 * Legal documents are written and versioned by the club in Dashboard > Settings > Legal.
 * The website does not supply legal wording of its own.
 */
export default function LegalPage({ doc }) {
  const { settings } = useSettings();
  useSeo({ title: TITLES[doc] });
  const state = useApi(`/legal/${doc}`);
  return (
    <>
      <PageBanner eyebrow="Legal" title={TITLES[doc]} />
      <Container className="max-w-3xl py-8">
        <AsyncContent
          state={state}
          loading={<SkeletonList rows={4} />}
          isEmpty={(d) => !d.body}
          empty={
            <EmptyState icon={FileText} title={`The ${TITLES[doc]} has not been published yet`}>
              {settings.name} will publish this document here. For questions about how your data is handled, contact the club.
            </EmptyState>
          }
        >
          {(d) => (
            <>
              <p className="mb-4 text-sm text-slate-600">
                Version {d.version}
                {d.updatedAt ? ` · Last updated ${formatDate(d.updatedAt)}` : ''}
              </p>
              {!d.approved && (
                <Alert tone="warning" className="mb-6">
                  This document is a draft and has not yet been approved by the club.
                </Alert>
              )}
              <Markdown text={d.body} />
            </>
          )}
        </AsyncContent>
      </Container>
    </>
  );
}

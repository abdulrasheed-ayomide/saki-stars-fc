import { Suspense } from 'react';
import { Link, Outlet, ScrollRestoration } from 'react-router';
import { SiteHeader } from '../components/layout/SiteHeader.jsx';
import { SiteFooter } from '../components/layout/SiteFooter.jsx';
import { ServerStatusNotice } from '../components/feedback/ServerStatusNotice.jsx';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import { Container } from '../components/layout/Container.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useSettings } from '../app/SettingsProvider.jsx';

/** Asks signed-in users to accept updated Terms/Privacy versions. */
function ConsentNotice() {
  const { user, status } = useAuth();
  const { settings, loaded } = useSettings();
  if (status !== 'authenticated' || !loaded || !user?.consents) return null;
  const v = settings.legalVersions || {};
  const outdated = (v.terms && user.consents.termsVersion && v.terms !== user.consents.termsVersion) || (v.privacy && user.consents.privacyVersion && v.privacy !== user.consents.privacyVersion);
  if (!outdated) return null;
  return (
    <div className="border-b border-brand-200 bg-brand-50 text-brand-900">
      <Container className="py-2 text-sm">
        Our Terms or Privacy Policy have changed.{' '}
        <Link to="/account/privacy" className="font-semibold underline">
          Review and accept
        </Link>
      </Container>
    </div>
  );
}

export function PublicLayout({ children }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded-md focus:bg-white focus:px-4 focus:py-3 focus:font-semibold focus:text-brand-900 focus:shadow-lg"
      >
        Skip to main content
      </a>
      <SiteHeader />
      <ServerStatusNotice />
      <ConsentNotice />
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        <Suspense fallback={<PageSpinner label="Loading page…" />}>{children ?? <Outlet />}</Suspense>
      </main>
      <SiteFooter />
      <ScrollRestoration />
    </div>
  );
}

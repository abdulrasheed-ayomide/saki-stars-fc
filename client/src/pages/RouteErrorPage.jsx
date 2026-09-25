import { isRouteErrorResponse, useRouteError } from 'react-router';
import { AlertTriangle } from 'lucide-react';
import { StatusMessage } from '../components/feedback/StatusMessage.jsx';
import { PublicLayout } from '../layouts/PublicLayout.jsx';
import NotFoundPage from './NotFoundPage.jsx';
import { logError } from '../lib/errors.js';

// A failed lazy import usually means a new version was deployed while the page was open.
function isChunkLoadError(error) {
  return /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error?.message ?? '');
}

/**
 * Router-level error boundary: a crash in one page shows a friendly message
 * inside the normal layout instead of a blank screen (Sections 49, 76).
 */
export default function RouteErrorPage() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <PublicLayout>
        <NotFoundPage />
      </PublicLayout>
    );
  }

  // Logged for developers (console / monitoring); never rendered on the page.
  logError({ kind: 'unexpected', developerMessage: error?.message, cause: error }, 'page crash');

  const chunk = isChunkLoadError(error);

  return (
    <PublicLayout>
      <StatusMessage
        icon={AlertTriangle}
        title={chunk ? 'A new version of the website is available' : 'Something went wrong'}
        actions={
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand-900 px-5 font-semibold text-white hover:bg-brand-800"
          >
            {chunk ? 'Reload page' : 'Try again'}
          </button>
        }
      >
        <p>{chunk ? 'Reload the page to continue.' : 'We’re sorry, but this page couldn’t be displayed correctly. If the problem continues, please try again later.'}</p>
      </StatusMessage>
    </PublicLayout>
  );
}

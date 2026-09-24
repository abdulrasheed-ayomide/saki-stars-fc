import { Loader2, WifiOff } from 'lucide-react';
import { useServerStatus } from '../../hooks/useServerStatus.js';
import { Container } from '../layout/Container.jsx';

/**
 * Tells visitors when the API is slow to wake (free-tier hosting) or unreachable,
 * instead of leaving them with a broken page.
 */
export function ServerStatusNotice() {
  const { status, retry } = useServerStatus();

  return (
    <div role="status" aria-live="polite">
      {status === 'waking' && (
        <div className="border-b border-amber-200 bg-amber-50 text-amber-900">
          <Container className="flex items-start gap-2 py-2 text-sm">
            <Loader2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin" />
            <p className="min-w-0">Connecting to the club server. This can take up to a minute.</p>
          </Container>
        </div>
      )}

      {status === 'offline' && (
        <div className="border-b border-red-200 bg-red-50 text-red-900">
          <Container className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            <p className="flex min-w-0 items-start gap-2">
              <WifiOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">The club server is not responding right now.</span>
            </p>
            <button
              type="button"
              onClick={retry}
              className="min-h-11 rounded-md px-2 font-semibold underline underline-offset-2 hover:bg-red-100"
            >
              Try again
            </button>
          </Container>
        </div>
      )}
    </div>
  );
}

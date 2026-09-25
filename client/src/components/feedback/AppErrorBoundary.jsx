import { Component } from 'react';
import { logError } from '../../lib/errors.js';

/**
 * Last line of defence for crashes outside the page routes (e.g. in the app providers).
 * Page crashes are handled by RouteErrorPage inside the normal layout. The technical error
 * is logged to the console; visitors only see a plain message and a way to recover.
 * Styled with plain markup because the providers (settings, router) may be what failed.
 */
export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    logError({ kind: 'unexpected', developerMessage: error?.message, cause: error }, `render crash${info?.componentStack ? ` ${info.componentStack.split('\n')[1]?.trim() || ''}` : ''}`);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main role="alert" className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-brand-900">Something went wrong</h1>
        <p className="mt-3 text-slate-600">We’re sorry, but this page couldn’t be displayed correctly. Please try again.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-brand-900 px-5 font-semibold text-white hover:bg-brand-800"
        >
          Try again
        </button>
      </main>
    );
  }
}

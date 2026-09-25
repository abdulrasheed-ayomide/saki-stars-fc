import { Alert } from './Feedback.jsx';
import { userMessage } from '../../lib/errors.js';

/**
 * Top-of-form summary for errors that are not tied to one field.
 * `context` words failures that are not the user's fault (see lib/errors.js), e.g. "contact".
 */
export function FormError({ error, context = 'save' }) {
  if (!error) return null;
  const message = error.code === 'VALIDATION_ERROR' ? 'Please correct the highlighted fields.' : userMessage(error, context);
  return (
    <Alert tone="error" className="mb-4">
      {message}
      {error.requestId && error.code !== 'VALIDATION_ERROR' && <span className="block text-xs opacity-80">Reference: {error.requestId}</span>}
    </Alert>
  );
}

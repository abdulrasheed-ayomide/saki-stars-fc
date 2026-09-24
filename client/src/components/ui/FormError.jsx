import { Alert } from './Feedback.jsx';

/** Top-of-form summary for errors that are not tied to one field. */
export function FormError({ error }) {
  if (!error) return null;
  const message = error.code === 'VALIDATION_ERROR' ? 'Please correct the highlighted fields.' : error.message;
  return (
    <Alert tone="error" className="mb-4">
      {message}
      {error.requestId && error.code !== 'VALIDATION_ERROR' && <span className="block text-xs opacity-80">Reference: {error.requestId}</span>}
    </Alert>
  );
}

import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Flag, MessageSquare, Pencil, Reply, Trash2 } from 'lucide-react';
import { useApi, qs } from '../../hooks/useApi.js';
import { apiRequest } from '../../services/apiClient.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useSettings } from '../../app/SettingsProvider.jsx';
import { useToast } from '../ui/Toast.jsx';
import { Button } from '../ui/Button.jsx';
import { Textarea } from '../ui/Field.jsx';
import { Alert, ErrorState, SkeletonList } from '../ui/Feedback.jsx';
import { Modal } from '../ui/Modal.jsx';
import { timeAgo } from '../../lib/format.js';
import { userMessage } from '../../lib/errors.js';

function CommentForm({ onSubmit, initial = '', submitLabel = 'Post comment', onCancel, autoFocus }) {
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(body.trim());
      setBody('');
    } catch (err) {
      setError(userMessage(err, 'save'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <label className="sr-only" htmlFor="comment-body">
        Your comment
      </label>
      <Textarea id="comment-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={3} placeholder="Share your thoughts. Please keep it respectful." autoFocus={autoFocus} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" loading={busy} disabled={body.trim().length < 2}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/**
 * Comments for a news article or match. Anyone can read approved comments; signed-in
 * users with a confirmed email can post, reply, edit (15 min), delete and report.
 */
export function Comments({ targetType, targetId }) {
  const { user, status } = useAuth();
  const { settings } = useSettings();
  const { notify } = useToast();
  const location = useLocation();
  const state = useApi(`/comments${qs({ targetType, targetId, limit: 100 })}`);
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [reporting, setReporting] = useState(null);
  const [reason, setReason] = useState('');

  if (settings.features?.comments === false) return null;
  const comments = state.data?.items || [];
  const top = comments.filter((c) => !c.parent);
  const replies = (id) => comments.filter((c) => c.parent === id);

  async function post(body, parent = null) {
    const res = await apiRequest('/comments', { method: 'POST', body: { targetType, targetId, body, parent } });
    notify(res.held ? 'Thanks! Your comment will appear after a moderator checks it.' : 'Comment posted.');
    setReplyTo(null);
    state.reload();
  }

  async function saveEdit(id, body) {
    await apiRequest(`/comments/${id}`, { method: 'PATCH', body: { body } });
    setEditing(null);
    notify('Comment updated.');
    state.reload();
  }

  async function remove(id) {
    await apiRequest(`/comments/${id}`, { method: 'DELETE' });
    notify('Comment deleted.');
    state.reload();
  }

  async function report() {
    try {
      const res = await apiRequest(`/comments/${reporting}/report`, { method: 'POST', body: { reason } });
      notify(res.message);
      setReporting(null);
      setReason('');
    } catch (err) {
      notify(userMessage(err, 'action'), 'error');
    }
  }

  // Render function (not a nested component) so forms inside keep their state across renders.
  const renderItem = (c, depth = 0) => {
    const canEdit = c.isOwn && !c.deleted && Date.now() - new Date(c.createdAt).getTime() < 15 * 60 * 1000;
    return (
      <li key={c.id} className={depth ? 'ml-4 border-l-2 border-slate-100 pl-4 sm:ml-8' : ''}>
        <article className="py-3">
          <header className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-semibold text-slate-900">{c.authorName}</span>
            <time dateTime={c.createdAt} className="text-xs text-slate-500">
              {timeAgo(c.createdAt)}
              {c.editedAt ? ' · edited' : ''}
            </time>
            {c.status && c.status !== 'approved' && <span className="text-xs font-semibold text-amber-700">Awaiting moderation (only you can see this)</span>}
          </header>
          {editing === c.id ? (
            <div className="mt-2">
              <CommentForm initial={c.body} submitLabel="Save" onSubmit={(b) => saveEdit(c.id, b)} onCancel={() => setEditing(null)} autoFocus />
            </div>
          ) : (
            <p className={`mt-1 whitespace-pre-line text-sm ${c.deleted ? 'italic text-slate-400' : 'text-slate-800'}`}>{c.deleted ? 'This comment was deleted.' : c.body}</p>
          )}
          {user && !c.deleted && editing !== c.id && (
            <div className="mt-1 flex flex-wrap gap-1">
              {depth === 0 && user.emailVerified && (
                <Button variant="ghost" size="sm" icon={Reply} onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}>
                  Reply
                </Button>
              )}
              {canEdit && (
                <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(c.id)}>
                  Edit
                </Button>
              )}
              {c.isOwn && (
                <Button variant="ghost" size="sm" icon={Trash2} onClick={() => remove(c.id)}>
                  Delete
                </Button>
              )}
              {!c.isOwn && user.emailVerified && (
                <Button variant="ghost" size="sm" icon={Flag} onClick={() => setReporting(c.id)}>
                  Report
                </Button>
              )}
            </div>
          )}
          {replyTo === c.id && (
            <div className="mt-2">
              <CommentForm submitLabel="Post reply" onSubmit={(b) => post(b, c.id)} onCancel={() => setReplyTo(null)} autoFocus />
            </div>
          )}
        </article>
        {replies(c.id).length > 0 && (
          <ul>
            {replies(c.id).map((r) => renderItem(r, 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <section id="comments" aria-labelledby="comments-title" className="mt-10 border-t border-slate-200 pt-6">
      <h2 id="comments-title" className="flex items-center gap-2 text-xl font-bold text-brand-900">
        <MessageSquare aria-hidden="true" className="size-5" />
        Comments {comments.length > 0 && <span className="text-base font-normal text-slate-500">({comments.filter((c) => !c.deleted).length})</span>}
      </h2>

      <div className="mt-4">
        {status === 'authenticated' ? (
          user.emailVerified ? (
            <CommentForm onSubmit={(b) => post(b)} />
          ) : (
            <Alert tone="warning">Confirm your email address to join the conversation. Check your inbox for the link.</Alert>
          )
        ) : (
          <Alert tone="info">
            <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} className="font-semibold underline">
              Sign in
            </Link>{' '}
            or{' '}
            <Link to="/register" className="font-semibold underline">
              create a free account
            </Link>{' '}
            to comment.
          </Alert>
        )}
      </div>

      <div className="mt-4">
        {state.error && !state.data ? (
          <ErrorState error={state.error} onRetry={state.reload} context="comments" />
        ) : state.loading && !state.data ? (
          <SkeletonList rows={2} />
        ) : top.length === 0 ? (
          <p className="text-sm text-slate-600">No comments yet. Be the first to share your thoughts.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {top.map((c) => renderItem(c))}
          </ul>
        )}
      </div>

      <Modal
        open={Boolean(reporting)}
        onClose={() => setReporting(null)}
        title="Report comment"
        description="Tell the moderators what is wrong with this comment."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setReporting(null)}>
              Cancel
            </Button>
            <Button onClick={report} disabled={reason.trim().length < 3}>
              Send report
            </Button>
          </>
        }
      >
        <label htmlFor="report-reason" className="text-sm font-medium">
          Reason
        </label>
        <Textarea id="report-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} placeholder="e.g. abusive language, spam" />
      </Modal>
    </section>
  );
}

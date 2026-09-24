import { Notification, Staff, User } from '../models/index.js';
import { resolveGrants } from '../auth/permissions.js';

/** In-app notifications. Email is reserved for account/security/approval events. */
export function createNotificationService({ logger }) {
  async function notify(recipients, { type, title, body = '', link = '' }) {
    const ids = [...new Set((Array.isArray(recipients) ? recipients : [recipients]).filter(Boolean).map(String))];
    if (ids.length === 0) return 0;
    try {
      await Notification.insertMany(ids.map((recipient) => ({ recipient, type, title, body, link })));
      return ids.length;
    } catch (err) {
      logger.error('Notification write failed', { type, reason: err.message });
      return 0;
    }
  }

  /** Active staff (with active login) who hold `permission`, optionally limited to a team scope. */
  async function staffWithPermission(permission, { teamId } = {}) {
    const staff = await Staff.find({ status: 'active', user: { $ne: null } }).select('user staffRole grants assignedTeams').lean();
    const userIds = staff
      .filter((s) => {
        const scope = resolveGrants(s).get(permission);
        if (!scope) return false;
        if (scope === 'all' || !teamId) return true;
        return scope === 'assigned_teams' && (s.assignedTeams || []).some((t) => String(t) === String(teamId));
      })
      .map((s) => s.user);
    const active = await User.find({ _id: { $in: userIds }, status: 'active' }).select('_id').lean();
    return active.map((u) => u._id);
  }

  async function notifyPermission(permission, payload, options) {
    return notify(await staffWithPermission(permission, options), payload);
  }

  return { notify, notifyPermission, staffWithPermission };
}

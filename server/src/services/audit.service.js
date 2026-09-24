import { AuditLog } from '../models/index.js';
import { redact } from '../utils/logger.js';

/**
 * Records important actions. Never throws: an audit failure is logged but does not
 * break the user's request. Secrets are removed from metadata before storing.
 */
export function createAuditService({ logger }) {
  return async function audit(req, { action, entityType = '', entityId = '', status = 'success', metadata = {}, actor } = {}) {
    try {
      const user = actor ?? req?.auth?.user ?? null;
      await AuditLog.create({
        actor: user?._id ?? null,
        actorName: user?.name ?? '',
        actorEmail: user?.email ?? '',
        action,
        entityType,
        entityId: entityId ? String(entityId) : '',
        status,
        ip: String(req?.ip || '').slice(0, 64),
        userAgent: String(req?.get?.('user-agent') || '').slice(0, 300),
        requestId: req?.id || '',
        metadata: redact(metadata),
      });
    } catch (err) {
      logger.error('Audit log write failed', { action, reason: err.message });
    }
  };
}

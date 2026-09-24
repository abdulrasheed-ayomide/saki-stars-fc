import { Router } from 'express';
import { z } from 'zod';
import { AuditLog } from '../../models/index.js';
import { validate } from '../../middleware/validate.js';
import { objectId, pagingQuery } from '../../validation/common.js';
import { idString } from '../../utils/ids.js';
import { escapeRegex } from '../../utils/text.js';
import { getPaging, findPaged } from '../../utils/pagination.js';

export function createAuditRouter({ auth }) {
  const router = Router();
  router.use(auth.requireAuth, auth.requireStaff, auth.requirePermission('audit.view'));

  router.get(
    '/',
    validate({
      query: z.object({
        action: z.string().trim().max(80).optional(),
        actor: objectId.optional(),
        entityType: z.string().trim().max(60).optional(),
        entityId: z.string().trim().max(60).optional(),
        status: z.enum(['success', 'failure', 'denied']).optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        ...pagingQuery,
      }),
    }),
    async (req, res) => {
      const q = req.valid.query;
      const filter = {};
      // "auth." matches every auth action; an exact name matches just that one.
      if (q.action) filter.action = q.action.endsWith('.') ? new RegExp(`^${escapeRegex(q.action)}`) : q.action;
      if (q.actor) filter.actor = q.actor;
      if (q.entityType) filter.entityType = q.entityType;
      if (q.entityId) filter.entityId = q.entityId;
      if (q.status) filter.status = q.status;
      if (q.from || q.to) filter.createdAt = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
      const result = await findPaged(AuditLog, filter, getPaging(q, { defaultLimit: 50 }), (qq) => qq.sort({ createdAt: -1 }));
      res.json({
        data: {
          ...result,
          items: result.items.map((a) => ({
            id: idString(a._id),
            action: a.action,
            status: a.status,
            actor: a.actor ? { id: idString(a.actor), name: a.actorName, email: a.actorEmail } : null,
            entityType: a.entityType,
            entityId: a.entityId,
            ip: a.ip,
            userAgent: a.userAgent,
            requestId: a.requestId,
            metadata: a.metadata || {},
            createdAt: a.createdAt,
          })),
        },
      });
    },
  );

  router.get('/actions', async (req, res) => {
    res.json({ data: (await AuditLog.distinct('action')).sort() });
  });

  return router;
}

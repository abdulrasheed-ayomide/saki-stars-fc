import { Router } from 'express';

/**
 * GET /health        – liveness: the process is up (used by Render health checks
 *                      and by the frontend to detect a sleeping free-tier server).
 * GET /health/ready  – readiness: the process can serve data (database connected).
 */
export function createHealthRouter({ isDatabaseReady }) {
  const router = Router();

  router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ data: { status: 'ok', uptimeSeconds: Math.round(process.uptime()) } });
  });

  router.get('/ready', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const ready = isDatabaseReady();
    res.status(ready ? 200 : 503).json({
      data: { status: ready ? 'ready' : 'unavailable', database: ready ? 'connected' : 'not_connected' },
    });
  });

  return router;
}

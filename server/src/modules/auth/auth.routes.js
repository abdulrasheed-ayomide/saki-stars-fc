import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { createAuthController } from './auth.controller.js';
import {
  registerSchema,
  loginSchema,
  emailOnlySchema,
  tokenSchema,
  resetSchema,
  changePasswordSchema,
} from './auth.schemas.js';

export function createAuthRouter(ctx) {
  const router = Router();
  const c = createAuthController(ctx);
  const { limiters, auth, csrf } = ctx;

  router.post('/register', limiters.register, validate({ body: registerSchema }), c.register);
  router.post('/verify-email', limiters.passwordReset, validate({ body: tokenSchema }), c.verifyEmail);
  router.post('/resend-verification', validate({ body: emailOnlySchema }), limiters.emailResend, c.resendVerification);
  router.post('/login', limiters.loginIp, validate({ body: loginSchema }), limiters.login, c.login);
  router.post('/refresh', limiters.refresh, csrf, c.refresh);
  router.post('/logout', csrf, c.logout);
  router.post('/logout-all', auth.requireAuth, c.logoutAll);
  router.post('/forgot-password', validate({ body: emailOnlySchema }), limiters.passwordReset, c.forgotPassword);
  router.post('/reset-password', limiters.passwordReset, validate({ body: resetSchema }), c.resetPassword);
  router.post('/change-password', auth.requireAuth, limiters.passwordReset, validate({ body: changePasswordSchema }), c.changePassword);
  router.get('/me', auth.requireAuth, c.me);
  router.get('/sessions', auth.requireAuth, c.sessions);
  router.delete('/sessions/:id', auth.requireAuth, c.revokeSession);

  return router;
}

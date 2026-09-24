import { z } from 'zod';

export const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);
const password = z.string().min(1, 'Enter a password.').max(128);

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name.').max(120),
  email,
  password,
  acceptTerms: z.literal(true, { error: 'You must accept the Terms and Privacy Policy.' }),
});

export const loginSchema = z.object({ email, password });
export const emailOnlySchema = z.object({ email });
export const tokenSchema = z.object({ token: z.string().min(10).max(200) });
export const resetSchema = z.object({ token: z.string().min(10).max(200), password });
export const changePasswordSchema = z.object({ currentPassword: password, newPassword: password });

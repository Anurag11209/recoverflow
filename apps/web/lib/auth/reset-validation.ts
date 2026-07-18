import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

export const requestResetSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  // The signed token from the emailed link ("<raw>.<hmac>"); bounded to avoid a
  // pathologically large body. Same 8-char minimum as registration for the new
  // password.
  token: z.string().min(1, 'Reset token is required').max(400),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

export type RequestResetInput = z.infer<typeof requestResetSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

export const registerSchema = z.object({
  organizationName: z.string().trim().min(1, 'Organization name is required').max(120),
  name: z.string().trim().min(1, 'Your name is required').max(120),
  email,
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

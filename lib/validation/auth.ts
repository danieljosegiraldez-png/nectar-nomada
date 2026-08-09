import { z } from "zod";

/** SECURITY.md §3 — every API/Server Action boundary validates with Zod before touching the service layer. */
export const signUpSchema = z.object({
  givenName: z.string().trim().min(1, "Required").max(120),
  familyName: z.string().trim().min(1, "Required").max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, "Required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

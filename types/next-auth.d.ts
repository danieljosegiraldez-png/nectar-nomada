import type { DefaultSession } from "next-auth";

// `session.user.id` is our UserAccount.id (DOMAIN_MODEL.md §1) — never a Role.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { prisma } from "../db";
import { verifyPassword } from "./password";
import { loginSchema } from "../validation/auth";

/**
 * SECURITY.md §1 — Auth.js handles authentication mechanics (credentials +
 * OAuth, session issuance); RBAC (DOMAIN_MODEL.md §1, RBAC.md) is entirely
 * separate and is never delegated to a provider's role/org features
 * (DECISIONS.md ADR-006). JWT session strategy — no Auth.js Session/Account
 * tables; the UserAccount/Person split (DOMAIN_MODEL.md §1) is the actual
 * source of truth, and Auth.js only ever holds a `sub` (= UserAccount.id).
 *
 * The Google provider is only registered when credentials are configured,
 * so local dev works with email/password alone without empty-string client
 * errors.
 */
const providers: NextAuthConfig["providers"] = [
  Credentials({
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(rawCredentials) {
      const parsed = loginSchema.safeParse(rawCredentials);
      if (!parsed.success) return null;
      const { email, password } = parsed.data;

      const userAccount = await prisma.userAccount.findFirst({
        where: { authProvider: "credentials", person: { email } },
        include: { person: true },
      });

      if (!userAccount || !userAccount.passwordHash) return null;
      if (userAccount.status !== "active") return null;

      const valid = await verifyPassword(userAccount.passwordHash, password);
      if (!valid) return null;

      await prisma.userAccount.update({
        where: { id: userAccount.id },
        data: { lastLoginAt: new Date() },
      });

      return {
        id: userAccount.id,
        email: userAccount.person.email ?? email,
        name: userAccount.person.displayName,
      };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

export const authConfig: NextAuthConfig = {
  providers,
  // A5.5 §4: shortened from Auth.js's ~30-day default to 7 days. This is a
  // uniform lever — Auth.js has no offline-only session concept, so it
  // applies the same online and off — chosen to bound how long a lost or
  // stolen device stays signed in without forcing daily re-auth for
  // operators who use the app most days.
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login" },
  callbacks: {
    /**
     * Runs before `jwt`. For the Credentials provider `user.id` is already
     * our UserAccount id (set in `authorize` above). For Google, there is no
     * database adapter (DECISIONS.md ADR-006), so account lookup/creation —
     * find-or-create Person + UserAccount keyed by (authProvider,
     * authSubject), falling back to matching an existing Person by email —
     * happens here, and the resulting UserAccount id is written onto `user`
     * so the `jwt` callback below picks it up as `token.sub`.
     */
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;

      const authSubject = account.providerAccountId;
      const email = profile?.email ?? user.email ?? null;

      let userAccount = await prisma.userAccount.findFirst({
        where: { authProvider: "google", authSubject },
      });

      if (!userAccount) {
        const existingPerson = email ? await prisma.person.findFirst({ where: { email } }) : null;

        userAccount = await prisma.$transaction(async (tx) => {
          const person =
            existingPerson ??
            (await tx.person.create({
              data: {
                givenName: (profile?.given_name as string | undefined) ?? user.name ?? "Unknown",
                familyName: (profile?.family_name as string | undefined) ?? "",
                displayName: user.name ?? email ?? "Néctar Nómada user",
                email,
              },
            }));

          return tx.userAccount.create({
            data: {
              personId: person.id,
              authProvider: "google",
              authSubject,
              status: "active",
              emailVerifiedAt: new Date(),
            },
          });
        });
      }

      user.id = userAccount.id;
      return true;
    },

    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
};

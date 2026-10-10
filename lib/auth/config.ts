import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { verifyPassword } from "./password";
import { loginSchema } from "../validation/auth";
import { DURACION_DE_SESION_S } from "./duracionDeSesion";

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
  session: { strategy: "jwt", maxAge: DURACION_DE_SESION_S },
  pages: { signIn: "/login" },
  callbacks: {
    /**
     * Runs before `jwt`. For the Credentials provider `user.id` is already
     * our UserAccount id (set in `authorize` above). For Google there is no
     * database adapter (DECISIONS.md ADR-006), so resolving the account
     * happens here, and the resulting UserAccount id is written onto `user`
     * so the `jwt` callback below picks it up as `token.sub`.
     *
     * Three cases, in order (ADR-075):
     *
     *   1. We have seen this Google identity before — use its account.
     *   2. A Person already exists with this email. They keep their single
     *      UserAccount; Google is *linked* to it. Creating a second account
     *      was the old behaviour and it failed on `person_id`'s unique index
     *      for every Person who could already sign in.
     *   3. Nobody matches — create Person, UserAccount and identity together.
     */
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;

      const subject = account.providerAccountId;
      const rawEmail = profile?.email ?? user.email ?? null;
      // Normalised the way loginSchema and signUpSchema do, so a Google
      // address matches the Person record however Google capitalises it.
      const email = rawEmail ? rawEmail.trim().toLowerCase() : null;

      // 1. Known identity.
      const identity = await prisma.externalIdentity.findUnique({
        where: { provider_subject: { provider: "google", subject } },
        include: { userAccount: true },
      });

      let userAccount = identity?.userAccount ?? null;

      if (identity) {
        await prisma.externalIdentity.update({
          where: { id: identity.id },
          data: { lastUsedAt: new Date() },
        });
      }

      if (!userAccount) {
        // Google verifies its own addresses, but say so explicitly: an
        // unverified address must never match an existing Person, or anyone
        // able to set that address on a Google account could claim it.
        const emailVerified = (profile as { email_verified?: boolean } | undefined)?.email_verified === true;
        const matchableEmail = email && emailVerified ? email : null;

        const existingPerson = matchableEmail
          ? await prisma.person.findUnique({
              where: { email: matchableEmail },
              include: { userAccount: true },
            })
          : null;

        // Las dos ramas de abajo auditan desde el 2026-09-06. Antes no
        // escribían ningún AuditEvent: una cuenta podía nacer, o ganar una vía
        // de autenticación nueva, sin dejar una sola fila que lo dijera —
        // mientras que activarla sí la dejaba. El actor es la propia cuenta,
        // igual que en la activación de más abajo y que en el alta por
        // contraseña de `app/actions/auth.ts`: nadie administró esto, la
        // persona entró. La cuenta existe dentro de la transacción cuando se
        // audita, así que la clave ajena del actor resuelve.
        userAccount = await prisma.$transaction(async (tx) => {
          // 2. Known person — link, never create a second account.
          if (existingPerson?.userAccount) {
            const identity = await tx.externalIdentity.create({
              data: { userAccountId: existingPerson.userAccount.id, provider: "google", subject, lastUsedAt: new Date() },
            });

            // Una cuenta que ya existía gana una VÍA DE ENTRADA nueva. Eso es
            // un cambio de seguridad por sí solo —quien controle ese Google
            // entra desde ahora—, así que lleva su propia operación en vez de
            // colgar de la cuenta.
            await recordAuditEvent(
              {
                actorUserAccountId: existingPerson.userAccount.id,
                operation: "external_identity.link",
                entityType: "external_identity",
                entityId: identity.id,
                after: { provider: "google", userAccountId: existingPerson.userAccount.id },
                reason: "google_sign_in_matched_existing_account",
                sourceInterface: "auth.google",
              },
              tx,
            );

            return existingPerson.userAccount;
          }

          // 3. Person with no account yet, or nobody at all.
          const personaExistia = existingPerson !== null;
          const person =
            existingPerson ??
            (await tx.person.create({
              data: {
                givenName: (profile?.given_name as string | undefined) ?? user.name ?? "Unknown",
                familyName: (profile?.family_name as string | undefined) ?? "",
                displayName: user.name ?? email ?? "Néctar Nómada user",
                email: matchableEmail,
              },
            }));

          const created = await tx.userAccount.create({
            data: {
              personId: person.id,
              authProvider: "google",
              status: "active",
              emailVerifiedAt: new Date(),
            },
          });

          const identity = await tx.externalIdentity.create({
            data: { userAccountId: created.id, provider: "google", subject, lastUsedAt: new Date() },
          });

          // Mismo nombre de operación que el alta por contraseña
          // (`app/actions/auth.ts`), para que las dos altas se lean juntas.
          // `personCreated` distingue las dos formas que esta rama tiene:
          // una Persona nueva, o una que ya estaba en la base sin cuenta.
          await recordAuditEvent(
            {
              actorUserAccountId: created.id,
              operation: "user_account.create",
              entityType: "user_account",
              entityId: created.id,
              after: {
                id: created.id,
                authProvider: "google",
                personId: person.id,
                personCreated: !personaExistia,
                externalIdentityId: identity.id,
              },
              reason: "google_sign_in_created_account",
              sourceInterface: "auth.google",
            },
            tx,
          );

          return created;
        });
      }

      // Accepting the invitation — ADR-083.
      //
      // `invited` is not a disabled account. It is an account nobody has
      // signed into yet, and reaching this line is exactly what accepting the
      // invitation looks like: either an ExternalIdentity already links this
      // Google subject, or the address Google verified matched a Person on
      // record. Both paths establish that the human holding this mailbox is
      // the person who was invited.
      //
      // Until this existed, `invited` was refused here along with the
      // deliberate revocations, and the only route out of it was the TTY
      // password script run per person. Thirteen of fourteen accounts sat in
      // that state holding real Assignments they could not reach — an
      // invitation that could never be accepted.
      if (userAccount.status === "invited") {
        // Capturadas fuera del cierre: dentro de la retrollamada de la
        // transacción TypeScript pierde el estrechamiento de `userAccount`.
        const cuenta = userAccount;
        const estadoAnterior = userAccount.status;

        // La activación y su AuditEvent en la misma transacción desde el
        // 2026-09-06. Antes eran dos llamadas sueltas: la cuenta quedaba
        // activa y, si el audit fallaba después, el único cambio de estado
        // que CLAUDE.md §35 exige registrar se perdía en silencio. Aquí eso
        // pesa más que en un servicio: es la fila que dice quién aceptó una
        // invitación y cuándo. Ver la cabecera de `lib/audit.ts`.
        //
        // El precio es que un fallo del audit tumba el inicio de sesión en
        // vez de dejar el hueco. Es el intercambio correcto: falla ruidoso y
        // el siguiente intento lo reintenta, mientras que el hueco no se ve
        // nunca.
        userAccount = await prisma.$transaction(async (tx) => {
          const activated = await tx.userAccount.update({
            where: { id: cuenta.id },
            data: {
              status: "active",
              emailVerifiedAt: cuenta.emailVerifiedAt ?? new Date(),
              lastLoginAt: new Date(),
            },
          });
          // A status change is exactly what CLAUDE.md §35 requires an audit row
          // for. The actor is the account itself: nobody administered this, the
          // invited person accepted it.
          await recordAuditEvent(
            {
              actorUserAccountId: activated.id,
              operation: "user_account.activate",
              entityType: "user_account",
              entityId: activated.id,
              before: { status: estadoAnterior },
              after: { status: activated.status, authProvider: activated.authProvider },
              reason: "invitation_accepted_via_google",
              sourceInterface: "auth.google",
            },
            tx,
          );
          return activated;
        });
      }

      // An account someone has disabled must not be revived by signing in
      // through a second provider — status is the control that stands alone
      // (the same property tests/auth/setPassword.test.ts pins for passwords).
      // `suspended` and `deactivated` are decisions someone made; only
      // `invited` above is a state nobody has acted on yet.
      if (userAccount.status !== "active") return false;

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

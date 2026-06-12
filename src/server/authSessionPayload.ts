import type { SessionToken } from '@/lib/authServer';
import { signSessionToken } from '@/lib/authServer';
import { applyNameCaseToUserFields } from '@/lib/nameCase';
import { prisma } from '@/lib/prisma';
import { buildProfileCompletionState } from '@/server/profileCompletion';
import { withDerivedCanonicalTeamIds } from '@/server/teams/teamMembership';

type AuthPayloadClient = typeof prisma | any;

export type AuthSessionPayloadUser = {
  id: string;
  email: string;
  name: string | null;
  googleSubject?: string | null;
  appleSubject?: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  sessionVersion?: number | null;
};

const toPublicUser = (user: AuthSessionPayloadUser) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  emailVerifiedAt: user.emailVerifiedAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export const buildAuthSessionPayload = async ({
  authUser,
  isAdmin = false,
  verificationEmailSent = false,
  client = prisma,
}: {
  authUser: AuthSessionPayloadUser;
  isAdmin?: boolean;
  verificationEmailSent?: boolean;
  client?: AuthPayloadClient;
}) => {
  const profile = await client.userData.findUnique({ where: { id: authUser.id } });
  const [profileWithDerivedTeamIds] = profile
    ? await withDerivedCanonicalTeamIds([profile], client)
    : [null];
  const session: SessionToken = {
    userId: authUser.id,
    isAdmin,
    sessionVersion: authUser.sessionVersion ?? 0,
  };
  const token = signSessionToken(session);
  const requiresEmailVerification = !authUser.emailVerifiedAt;

  return {
    token,
    payload: {
      user: toPublicUser(authUser),
      session,
      token,
      profile: profileWithDerivedTeamIds
        ? applyNameCaseToUserFields(profileWithDerivedTeamIds as typeof profileWithDerivedTeamIds & {
          firstName?: string | null;
          lastName?: string | null;
        })
        : null,
      ...buildProfileCompletionState({
        authUser: {
          googleSubject: authUser.googleSubject ?? null,
          appleSubject: authUser.appleSubject ?? null,
        },
        profile,
      }),
      ...(requiresEmailVerification
        ? {
            code: 'EMAIL_NOT_VERIFIED',
            email: authUser.email,
            requiresEmailVerification: true,
            verificationEmailSent,
          }
        : {
            requiresEmailVerification: false,
            verificationEmailSent: false,
          }),
    },
  };
};

import type { AuthUser, UserData } from '@/generated/prisma/client';
import { normalizeOptionalName } from '@/lib/nameCase';
import { isUnknownDateOfBirth } from '@/server/userPrivacy';

export const REQUIRED_PROFILE_FIELDS = ['firstName', 'lastName', 'dateOfBirth'] as const;

export type RequiredProfileField = (typeof REQUIRED_PROFILE_FIELDS)[number];

type ProfileCompletionAuthUser = Pick<AuthUser, 'appleSubject' | 'googleSubject'>;
type ProfileCompletionUserData = Pick<
  UserData,
  'firstName' | 'lastName' | 'dateOfBirth' | 'requiredProfileFieldsCompletedAt'
>;

const LEGACY_OAUTH_DOB_PLACEHOLDER = '2000-01-01';

const normalizeDateOnly = (value: Date | string | null | undefined): string | null => {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const hasOauthLink = (authUser: ProfileCompletionAuthUser | null | undefined): boolean => {
  const appleSubject = authUser?.appleSubject?.trim();
  const googleSubject = authUser?.googleSubject?.trim();
  return Boolean(appleSubject || googleSubject);
};

const isBlankName = (value: string | null | undefined): boolean => !normalizeOptionalName(value);

const isLegacyOauthDobPlaceholder = ({
  authUser,
  profile,
}: {
  authUser: ProfileCompletionAuthUser | null | undefined;
  profile: ProfileCompletionUserData | null | undefined;
}): boolean => {
  if (!profile || profile.requiredProfileFieldsCompletedAt) return false;
  if (!hasOauthLink(authUser)) return false;
  return normalizeDateOnly(profile.dateOfBirth) === LEGACY_OAUTH_DOB_PLACEHOLDER;
};

export const resolveMissingRequiredProfileFields = ({
  authUser,
  profile,
}: {
  authUser: ProfileCompletionAuthUser | null | undefined;
  profile: ProfileCompletionUserData | null | undefined;
}): RequiredProfileField[] => {
  if (!profile) return [...REQUIRED_PROFILE_FIELDS];

  const missingFields: RequiredProfileField[] = [];

  if (isBlankName(profile.firstName)) {
    missingFields.push('firstName');
  }
  if (isBlankName(profile.lastName)) {
    missingFields.push('lastName');
  }
  if (isUnknownDateOfBirth(profile.dateOfBirth) || isLegacyOauthDobPlaceholder({ authUser, profile })) {
    missingFields.push('dateOfBirth');
  }

  return missingFields;
};

export const buildProfileCompletionState = ({
  authUser,
  profile,
}: {
  authUser: ProfileCompletionAuthUser | null | undefined;
  profile: ProfileCompletionUserData | null | undefined;
}) => {
  const missingProfileFields = resolveMissingRequiredProfileFields({ authUser, profile });
  return {
    requiresProfileCompletion: missingProfileFields.length > 0,
    missingProfileFields,
  };
};

export const resolveRequiredProfileFieldsCompletedAt = ({
  authUser,
  profile,
  now = new Date(),
}: {
  authUser: ProfileCompletionAuthUser | null | undefined;
  profile: ProfileCompletionUserData;
  now?: Date;
}): Date | null => {
  const missingProfileFields = resolveMissingRequiredProfileFields({ authUser, profile });
  if (missingProfileFields.length > 0) {
    return null;
  }
  return profile.requiredProfileFieldsCompletedAt ?? now;
};

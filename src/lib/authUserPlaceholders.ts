export const INVITED_PLACEHOLDER_PASSWORD_HASH = '__NO_PASSWORD__';

type MinimalAuthUser = {
  passwordHash: string;
  lastLogin?: Date | null;
  emailVerifiedAt?: Date | null;
};

// Invite-created accounts have no usable password and must be "claimed" by registering
// or by signing in via Google. We use a sentinel hash value that will never validate.
export const isInvitePlaceholderAuthUser = (user: MinimalAuthUser | null | undefined): boolean => {
  if (!user) return false;
  return user.passwordHash === INVITED_PLACEHOLDER_PASSWORD_HASH
    && !user.lastLogin
    && !user.emailVerifiedAt;
};


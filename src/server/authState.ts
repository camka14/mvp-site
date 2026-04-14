type AuthUserStatus = {
  disabledAt?: Date | null;
  disabledReason?: string | null;
};

export const ACCOUNT_SUSPENDED_CODE = 'ACCOUNT_SUSPENDED';

export const isAuthUserSuspended = (authUser: AuthUserStatus | null | undefined): boolean => (
  Boolean(authUser?.disabledAt)
);

export const buildSuspendedResponse = (): Response => (
  new Response('Account suspended', { status: 403 })
);

export const assertAuthUserIsActive = (authUser: AuthUserStatus | null | undefined): void => {
  if (isAuthUserSuspended(authUser)) {
    throw buildSuspendedResponse();
  }
};

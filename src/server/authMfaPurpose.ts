export const AuthMfaChallengePurpose = {
  LOGIN: 'LOGIN',
  LOGIN_SETUP: 'LOGIN_SETUP',
  PROFILE_PHONE_SETUP: 'PROFILE_PHONE_SETUP',
  PROFILE_TOTP_SETUP: 'PROFILE_TOTP_SETUP',
} as const;

export type AuthMfaChallengePurpose =
  (typeof AuthMfaChallengePurpose)[keyof typeof AuthMfaChallengePurpose];

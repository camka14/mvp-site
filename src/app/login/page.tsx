'use client';

import { useState, ChangeEvent, FormEvent, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/app/providers';
import { ApiError, authService, type AuthSessionResult } from '@/lib/auth';
import { getHomePathForUser } from '@/lib/homePage';
import { ONBOARDING_PATH } from '@/lib/onboardingIntent';
import { userService } from '@/lib/userService';
import Loading from '@/components/ui/Loading';
import { ProfileImageUploadField } from '@/components/ui/ProfileImageUploadField';

interface FormData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  userName: string;
  dateOfBirth: string;
}

type MfaLoginState = {
  challengeId: string;
  expiresAt: string;
  setupQrUrl?: string;
  setupRequired: boolean;
};

const getMfaOfferSkipKey = (userId: string): string => `bracketiq:mfa-offer-skipped:${userId}`;

const getSafeMfaReturnPath = (value: string | null): string | null => {
  if (!value) return null;
  const path = value.trim();
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  if (path === '/login' || path.startsWith('/login?')) return null;
  return path;
};

function LoginPageContent() {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState<FormData>({ email: '', password: '', firstName: '', lastName: '', userName: '', dateOfBirth: '' });
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [mfaState, setMfaState] = useState<MfaLoginState | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaReturnPath, setMfaReturnPath] = useState<string | null>(null);
  const [optionalMfaAuthResult, setOptionalMfaAuthResult] = useState<AuthSessionResult | null>(null);
  const [optionalMfaChallengeId, setOptionalMfaChallengeId] = useState('');
  const [optionalMfaQrUrl, setOptionalMfaQrUrl] = useState('');
  const [handlingOauthMfaOffer, setHandlingOauthMfaOffer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verificationPendingEmail, setVerificationPendingEmail] = useState('');
  const [verificationMessage, setVerificationMessage] = useState('');
  const [verificationMessageType, setVerificationMessageType] = useState<'info' | 'success'>('info');
  const [resendingVerification, setResendingVerification] = useState(false);
  const {
    user,
    setUser,
    setAuthUser,
    loading: authLoading,
    requiresProfileCompletion,
  } = useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isOauthMfaOffer = searchParams.get('oauth') === 'google' && searchParams.get('mfaOffer') === '1';
  const today = new Date();
  const maxDob = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && user && !optionalMfaAuthResult && !isOauthMfaOffer) {
      router.push(requiresProfileCompletion ? '/complete-profile' : getHomePathForUser(user));
    }
  }, [authLoading, isOauthMfaOffer, optionalMfaAuthResult, requiresProfileCompletion, router, user]);

  useEffect(() => {
    const oauth = searchParams.get('oauth');
    const oauthError = searchParams.get('error');
    if (oauth === 'google' && oauthError) {
      setError('Google sign-in failed. Please try again.');
    }

    const oauthMfaMode = searchParams.get('mfa');
    const oauthMfaChallenge = searchParams.get('mfaChallenge');
    if (oauth === 'google' && oauthMfaChallenge && (oauthMfaMode === 'setup' || oauthMfaMode === 'code')) {
      setMfaState({
        challengeId: oauthMfaChallenge,
        expiresAt: searchParams.get('mfaExpiresAt') || '',
        setupQrUrl: searchParams.get('mfaSetupQrUrl') || undefined,
        setupRequired: oauthMfaMode === 'setup',
      });
      setMfaCode('');
      setMfaReturnPath(getSafeMfaReturnPath(searchParams.get('next')));
      setVerificationMessage(
        oauthMfaMode === 'setup'
          ? 'Scan the QR code with an authenticator app, then enter the 6-digit code.'
          : 'Enter the 6-digit code from your authenticator app.',
      );
      setVerificationMessageType('info');
      setError('');
    }

    const verificationStatus = searchParams.get('verification');
    const verificationStatusMessage = searchParams.get('verificationMessage')?.trim();
    if (verificationStatus === 'success') {
      setVerificationMessage(verificationStatusMessage || 'Email verified successfully. You can sign in now.');
      setVerificationMessageType('success');
      setVerificationPendingEmail('');
      setError('');
    } else if (verificationStatus === 'error') {
      setError(verificationStatusMessage || 'Unable to verify email. Please request another verification email.');
    }

    if (verificationStatus && typeof window !== 'undefined') {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('verification');
      nextUrl.searchParams.delete('verificationMessage');
      window.history.replaceState({}, '', nextUrl.toString());
    }

    if ((oauthMfaMode || oauthMfaChallenge) && typeof window !== 'undefined') {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('mfa');
      nextUrl.searchParams.delete('mfaChallenge');
      nextUrl.searchParams.delete('mfaExpiresAt');
      nextUrl.searchParams.delete('mfaSetupQrUrl');
      window.history.replaceState({}, '', nextUrl.toString());
    }
  }, [searchParams]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const resetMfaState = () => {
    setMfaState(null);
    setMfaCode('');
    setMfaReturnPath(null);
  };

  const resetOptionalMfaState = () => {
    setOptionalMfaAuthResult(null);
    setOptionalMfaChallengeId('');
    setOptionalMfaQrUrl('');
    setMfaCode('');
  };

  const completeAuth = (authResult: AuthSessionResult, returnPath = mfaReturnPath) => {
    if (!authResult?.user) {
      throw new Error('Authentication failed');
    }

    const extendedUser = authResult.profile;
    if (!extendedUser) {
      throw new Error('Failed to retrieve user profile data');
    }

    setUser(extendedUser);
    setAuthUser(authResult.user);
    router.push(
      authResult.requiresProfileCompletion
        ? '/complete-profile'
        : returnPath || getHomePathForUser(extendedUser),
    );
  };

  const attachProfileImageToAuthResult = async (authResult: AuthSessionResult): Promise<AuthSessionResult> => {
    if (!profileImageFile) {
      return authResult;
    }

    const userId = authResult.profile?.$id ?? authResult.user?.$id;
    if (!userId) {
      return authResult;
    }

    try {
      const upload = await userService.uploadProfileImage(profileImageFile);
      const updatedProfile = await userService.updateProfile(userId, {
        profileImageId: upload.fileId,
      });
      return {
        ...authResult,
        profile: updatedProfile,
      };
    } catch (uploadError) {
      console.error('Profile image upload failed after account creation:', uploadError);
      return authResult;
    }
  };

  const maybeOfferMfaSetup = async (authResult: AuthSessionResult): Promise<boolean> => {
    const userId = authResult.user?.$id;
    if (!userId || typeof window === 'undefined') {
      return false;
    }

    try {
      if (window.localStorage.getItem(getMfaOfferSkipKey(userId)) === '1') {
        return false;
      }
      const status = await authService.getTotpMfaStatus();
      if (status.mfa.localBypassEnabled) {
        return false;
      }
      if (status.mfa.authenticatorEnabled) {
        return false;
      }
      setOptionalMfaAuthResult(authResult);
      setOptionalMfaChallengeId('');
      setOptionalMfaQrUrl('');
      setMfaCode('');
      setVerificationMessage('');
      setError('');
      return true;
    } catch {
      return false;
    }
  };

  const skipOptionalMfaSetup = () => {
    if (optionalMfaAuthResult?.user?.$id && typeof window !== 'undefined') {
      window.localStorage.setItem(getMfaOfferSkipKey(optionalMfaAuthResult.user.$id), '1');
    }
    const authResult = optionalMfaAuthResult;
    resetOptionalMfaState();
    if (authResult) {
      completeAuth(authResult);
    }
  };

  useEffect(() => {
    if (!isOauthMfaOffer) {
      setHandlingOauthMfaOffer(false);
      return;
    }

    let cancelled = false;
    const returnPath = getSafeMfaReturnPath(searchParams.get('next'));
    setHandlingOauthMfaOffer(true);
    setMfaReturnPath(returnPath);

    const loadGoogleSessionOffer = async () => {
      try {
        const authResult = await authService.fetchSession();
        if (!authResult.user || !authResult.session) {
          throw new Error('Google sign-in did not create a valid session.');
        }

        if (cancelled) return;
        if (await maybeOfferMfaSetup(authResult)) {
          return;
        }
        completeAuth(authResult, returnPath);
      } catch (offerError: any) {
        if (cancelled) return;
        setError(offerError?.message || 'Google sign-in failed. Please try again.');
      } finally {
        if (!cancelled) {
          setHandlingOauthMfaOffer(false);
        }
      }
    };

    void loadGoogleSessionOffer();

    return () => {
      cancelled = true;
    };
  }, [isOauthMfaOffer, searchParams]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setVerificationMessage('');
    setVerificationPendingEmail('');

    try {
      if (optionalMfaAuthResult) {
        if (!optionalMfaChallengeId) {
          const result = await authService.startProfileTotpMfa();
          setOptionalMfaChallengeId(result.mfa.challengeId);
          setOptionalMfaQrUrl(result.mfa.setupQrUrl || '');
          setVerificationMessage('Scan the QR code, then enter the 6-digit code from your authenticator app.');
          setVerificationMessageType('info');
          return;
        }

        await authService.confirmProfileTotpMfa(optionalMfaChallengeId, mfaCode);
        const authResult = optionalMfaAuthResult;
        resetOptionalMfaState();
        completeAuth(authResult);
        return;
      }

      if (mfaState) {
        const authResult = mfaState.setupRequired
          ? await authService.confirmLoginMfaSetup(mfaState.challengeId, mfaCode)
          : await authService.confirmLoginMfa(mfaState.challengeId, mfaCode);
        completeAuth(authResult);
        return;
      }

      let authResult: Awaited<ReturnType<typeof authService.login>> | null = null;
      if (isLogin) {
        authResult = await authService.login(formData.email, formData.password);
      } else {
        // Basic validation for signup fields
        if (!formData.firstName || !formData.lastName || !formData.userName || !formData.dateOfBirth) {
          throw new Error('Please provide first name, last name, username, and date of birth');
        }
        authResult = await authService.createAccount(
          formData.email,
          formData.password,
          formData.firstName,
          formData.lastName,
          formData.userName,
          formData.dateOfBirth
        );
        authResult = await attachProfileImageToAuthResult(authResult);
      }

      if (await maybeOfferMfaSetup(authResult)) {
        return;
      }

      completeAuth(authResult);

    } catch (error: any) {
      console.error('Auth error:', error);
      if (error instanceof ApiError && (error.code === 'MFA_REQUIRED' || error.code === 'MFA_SETUP_REQUIRED')) {
        const mfa = error.data.mfa;
        if (mfa?.challengeId) {
          setMfaState({
            challengeId: mfa.challengeId,
            expiresAt: typeof mfa.expiresAt === 'string' ? mfa.expiresAt : '',
            setupQrUrl: typeof mfa.setupQrUrl === 'string' ? mfa.setupQrUrl : undefined,
            setupRequired: error.code === 'MFA_SETUP_REQUIRED',
          });
          setMfaCode('');
          setMfaReturnPath(null);
          setVerificationMessage(
            error.code === 'MFA_SETUP_REQUIRED'
              ? 'Scan the QR code with an authenticator app, then enter the 6-digit code.'
              : 'Enter the 6-digit code from your authenticator app.',
          );
          setVerificationMessageType('info');
          setError('');
          return;
        }
      }
      if (error instanceof ApiError && error.code === 'EMAIL_NOT_VERIFIED') {
        const pendingEmail = error.email || formData.email.trim().toLowerCase();
        setVerificationPendingEmail(pendingEmail);
        setVerificationMessage(error.message || 'Please verify your email before signing in.');
        setVerificationMessageType('info');
        setError('');
        return;
      }
      setError(error.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!verificationPendingEmail) return;
    setResendingVerification(true);
    setError('');
    try {
      await authService.resendVerification(verificationPendingEmail);
      setVerificationMessage(`Verification email sent to ${verificationPendingEmail}.`);
      setVerificationMessageType('info');
    } catch (resendError: any) {
      setError(resendError?.message || 'Failed to resend verification email.');
    } finally {
      setResendingVerification(false);
    }
  };

  const handleGuest = async () => {
    setLoading(true);
    setError('');
    try {
      // If already in guest mode, skip creating a new session
      if (authService.isGuest()) {
        router.push(ONBOARDING_PATH);
        return;
      }

      await authService.guestLogin();
      router.push(ONBOARDING_PATH);
    } catch (e: any) {
      setError(e?.message || 'Failed to start guest session');
    } finally {
      setLoading(false);
    }
  };

  const submitLabel = optionalMfaAuthResult
    ? (optionalMfaChallengeId ? 'Verify app' : 'Set up authenticator')
    : mfaState
      ? 'Verify code'
      : (isLogin ? 'Sign In' : 'Create Account');

  // Show loading while checking authentication
  if (authLoading || handlingOauthMfaOffer) {
    return <Loading />;
  }

  // If user is already authenticated, show loading while redirecting
  if (user && !optionalMfaAuthResult) {
    return <Loading />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-bold text-white">M</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {optionalMfaAuthResult
              ? 'Add Authenticator?'
              : mfaState
                ? (mfaState.setupRequired ? 'Set Up Authenticator' : 'Verify Authenticator')
                : (isLogin ? 'Welcome Back' : 'Create Account')}
          </h1>
          <p className="text-gray-600 mt-2">
            {optionalMfaAuthResult
              ? 'You can add extra protection now or skip for later'
              : mfaState
                ? 'Finish sign-in with your authenticator app'
                : (isLogin ? 'Sign in to find amazing events' : 'Join us to discover events')}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {optionalMfaAuthResult ? (
            <>
              {optionalMfaChallengeId && optionalMfaQrUrl ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
                  <p className="mb-3 text-sm font-medium text-gray-800">
                    Scan this QR code with Microsoft Authenticator, Google Authenticator, 1Password, or Authy.
                  </p>
                  <img
                    src={optionalMfaQrUrl}
                    alt="Authenticator setup QR code"
                    className="mx-auto h-48 w-48 rounded-lg border border-gray-200 bg-white p-2"
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                  <p className="text-sm text-blue-900">
                    Authenticator apps protect your account with a 6-digit code. You will need one before creating a Stripe account to collect payments.
                  </p>
                </div>
              )}
              {optionalMfaChallengeId ? (
                <div>
                  <label htmlFor="optionalMfaCode" className="block text-sm font-medium text-gray-700 mb-2">
                    Authenticator code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    id="optionalMfaCode"
                    name="optionalMfaCode"
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.currentTarget.value)}
                    required
                    autoComplete="one-time-code"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder="Enter 6-digit code"
                    maxLength={16}
                  />
                </div>
              ) : null}
            </>
          ) : mfaState ? (
            <>
              {mfaState.setupRequired && mfaState.setupQrUrl ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
                  <p className="mb-3 text-sm font-medium text-gray-800">
                    Scan this QR code with Microsoft Authenticator, Google Authenticator, 1Password, or Authy.
                  </p>
                  <img
                    src={mfaState.setupQrUrl}
                    alt="Authenticator setup QR code"
                    className="mx-auto h-48 w-48 rounded-lg border border-gray-200 bg-white p-2"
                  />
                </div>
              ) : null}
              <div>
                <label htmlFor="mfaCode" className="block text-sm font-medium text-gray-700 mb-2">
                  Authenticator code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  id="mfaCode"
                  name="mfaCode"
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.currentTarget.value)}
                  required
                  autoComplete="one-time-code"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="Enter 6-digit code"
                  maxLength={16}
                />
              </div>
            </>
          ) : !isLogin && (
            <>
              <ProfileImageUploadField
                file={profileImageFile}
                onFileChange={(file) => {
                  setError('');
                  setProfileImageFile(file);
                }}
                disabled={loading}
                onError={setError}
              />

              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="Enter your first name"
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="Enter your last name"
                />
              </div>
              <div>
                <label htmlFor="userName" className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                <input
                  type="text"
                  id="userName"
                  name="userName"
                  value={formData.userName}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
	                  placeholder="Choose a username"
	                  autoComplete="username"
	                />
              </div>
              <div>
                <label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700 mb-2">Date of Birth</label>
                <input
                  type="date"
                  id="dateOfBirth"
                  name="dateOfBirth"
                  value={formData.dateOfBirth}
                  onChange={handleInputChange}
                  required
                  max={maxDob}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
              </div>
            </>
          )}

          {!mfaState && !optionalMfaAuthResult && (
            <>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="Enter your email"
                  autoComplete={isLogin ? 'username' : 'email'}
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="Enter your password"
                  minLength={8}
                  autoComplete="current-password"
                />
              </div>
            </>
          )}

          {verificationMessage && (
            <div
              className={`border rounded-lg p-4 ${
                verificationMessageType === 'success'
                  ? 'bg-green-50 border-green-200'
                  : 'bg-amber-50 border-amber-200'
              }`}
            >
              <p
                className={`text-sm ${
                  verificationMessageType === 'success' ? 'text-green-800' : 'text-amber-800'
                }`}
              >
                {verificationMessage}
              </p>
              {verificationPendingEmail && (
                <button
                  type="button"
                  disabled={resendingVerification}
                  onClick={handleResendVerification}
                  className="mt-3 text-sm font-medium text-amber-900 underline disabled:opacity-50"
                >
                  {resendingVerification ? 'Sending...' : 'Resend verification email'}
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Please wait...' : submitLabel}
          </button>
          {mfaState && (
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                resetMfaState();
                setVerificationMessage('');
                setError('');
              }}
              className="w-full border border-gray-300 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Back to sign in
            </button>
          )}
          {optionalMfaAuthResult && (
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setVerificationMessage('');
                setError('');
                skipOptionalMfaSetup();
              }}
              className="w-full border border-gray-300 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Skip for now
            </button>
          )}
        </form>

        {!mfaState && !optionalMfaAuthResult && (
          <>
            {/* Toggle */}
            <div className="text-center mt-6">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError('');
                  setVerificationPendingEmail('');
                  setVerificationMessage('');
                  setProfileImageFile(null);
                  resetMfaState();
                }}
                className="text-blue-600 hover:text-blue-800 font-medium text-sm"
              >
                {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </button>
            </div>

            {/* Or divider */}
            <div className="flex items-center my-4">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="px-3 text-gray-400 text-sm">or</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Google OAuth */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => authService.oauthLoginWithGoogle()}
                disabled={loading}
                className="w-full border border-gray-300 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12 c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C33.64,6.053,29.084,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20 s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,16.108,18.961,13,24,13c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657 C33.64,6.053,29.084,4,24,4C16.318,4,9.689,8.337,6.306,14.691z"/><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.195l-6.185-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946 l-6.522,5.021C9.495,39.556,16.227,44,24,44z"/><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.083,5.568c0.001-0.001,0.002-0.001,0.003-0.002 l6.185,5.238C36.246,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/></svg>
                Continue with Google
              </button>
            </div>

            {/* Continue as Guest */}
            <div className="text-center mt-4">
              <button
                type="button"
                onClick={handleGuest}
                disabled={loading}
                className="text-gray-600 hover:text-gray-800 font-medium text-sm underline disabled:opacity-50"
              >
                {loading ? 'Please wait...' : 'Continue as guest'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  // `useSearchParams` triggers a CSR bailout during prerendering; wrapping the component that reads it
  // in a Suspense boundary is required for `next build` to succeed.
  return (
    <Suspense fallback={<Loading />}>
      <LoginPageContent />
    </Suspense>
  );
}

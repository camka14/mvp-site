import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import GuestDiscoverRedirect from '@/components/onboarding/GuestDiscoverRedirect';
import GuestIntentOnboarding from '@/components/onboarding/GuestIntentOnboarding';
import LandingPage from '@/components/landing/LandingPage';
import {
  GUEST_ONBOARDING_COOKIE,
  isGuestOnboardingCookieComplete,
} from '@/lib/guestOnboarding';
import { resolveLandingRedirectPathFromToken } from '@/server/landingRedirect';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value ?? null;
  const redirectPath = await resolveLandingRedirectPathFromToken(token);

  if (redirectPath) {
    redirect(redirectPath);
  }

  if (isGuestOnboardingCookieComplete(cookieStore.get(GUEST_ONBOARDING_COOKIE)?.value)) {
    return <GuestDiscoverRedirect />;
  }

  return (
    <>
      <LandingPage brandHref="/" />
      <GuestIntentOnboarding />
    </>
  );
}

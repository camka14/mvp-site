import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import LandingPage from '@/components/landing/LandingPage';
import { resolveLandingRedirectPathFromToken } from '@/server/landingRedirect';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const token = (await cookies()).get('auth_token')?.value ?? null;
  const redirectPath = await resolveLandingRedirectPathFromToken(token);

  if (redirectPath) {
    redirect(redirectPath);
  }

  return <LandingPage brandHref="/" />;
}

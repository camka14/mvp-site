import { notFound, permanentRedirect, redirect } from 'next/navigation';
import {
  getDisabledPublicOrganizationRedirectPath,
  getPublicOrganizationTeamForRegistration,
  getPublicOrganizationRedirectPath,
} from '@/server/publicOrganizationCatalog';
import PublicTeamRegistrationClient from './PublicTeamRegistrationClient';

export const dynamic = 'force-dynamic';

export default async function PublicTeamRegistrationPage({
  params,
}: {
  params: Promise<{ slug: string; teamId: string }>;
}) {
  const { slug, teamId } = await params;
  const canonicalRedirectPath = await getPublicOrganizationRedirectPath(slug, {
    suffix: `/teams/${encodeURIComponent(teamId)}`,
  });
  if (canonicalRedirectPath) {
    if (canonicalRedirectPath.startsWith('/o/')) {
      permanentRedirect(canonicalRedirectPath);
    }
    redirect(canonicalRedirectPath);
  }
  const data = await getPublicOrganizationTeamForRegistration(slug, teamId);
  if (!data) {
    const redirectPath = await getDisabledPublicOrganizationRedirectPath(slug);
    if (redirectPath) {
      redirect(redirectPath);
    }
    notFound();
  }

  return (
    <PublicTeamRegistrationClient
      slug={slug}
      organization={data.organization}
      team={data.team}
    />
  );
}

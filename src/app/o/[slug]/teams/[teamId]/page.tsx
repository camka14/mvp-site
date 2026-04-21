import { notFound } from 'next/navigation';
import { getPublicOrganizationTeamForRegistration } from '@/server/publicOrganizationCatalog';
import PublicTeamRegistrationClient from './PublicTeamRegistrationClient';

export const dynamic = 'force-dynamic';

export default async function PublicTeamRegistrationPage({
  params,
}: {
  params: Promise<{ slug: string; teamId: string }>;
}) {
  const { slug, teamId } = await params;
  const data = await getPublicOrganizationTeamForRegistration(slug, teamId);
  if (!data) {
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

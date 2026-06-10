import TeamManagementPageClient from '../TeamManagementPageClient';

export const dynamic = 'force-dynamic';

type TeamManagementPageProps = {
  params: Promise<{
    teamId: string;
    tab?: string[];
  }>;
};

export default async function TeamManagementPage({ params }: TeamManagementPageProps) {
  const { teamId, tab } = await params;

  return (
    <TeamManagementPageClient
      teamId={teamId}
      initialTabSegment={tab?.[0] ?? null}
    />
  );
}

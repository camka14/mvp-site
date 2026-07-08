import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Navigation from '@/components/layout/Navigation';
import { buildTeamManagementPath } from '@/app/teams/teamRoutes';
import { prisma } from '@/lib/prisma';
import { applyNameCaseToUserFields } from '@/lib/nameCase';
import { resolveRazumlyAdminFromToken } from '@/server/razumlyAdmin';
import { Badge, Button, Container, Group, Paper, SimpleGrid, Text, Title } from '@mantine/core';

export const dynamic = 'force-dynamic';

type AdminUserProfilePageProps = {
  params: Promise<{ id: string }>;
};

const formatValue = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toLocaleString();
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '—';
};

export default async function AdminUserProfilePage({ params }: AdminUserProfilePageProps) {
  const token = (await cookies()).get('auth_token')?.value ?? null;
  const { session, status } = await resolveRazumlyAdminFromToken(token);

  if (!session) {
    redirect('/login');
  }
  if (!status.allowed) {
    redirect('/discover');
  }

  const { id } = await params;
  const userId = id.trim();
  if (!userId) {
    notFound();
  }

  const [
    profile,
    authUser,
    sensitiveUser,
    staffMemberships,
    hostedEvents,
    teamRegistrations,
    staffAssignments,
  ] = await Promise.all([
    prisma.userData.findUnique({ where: { id: userId } }),
    prisma.authUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        disabledAt: true,
        disabledReason: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.sensitiveUserData.findFirst({
      where: { userId },
      select: {
        email: true,
        billingCity: true,
        billingState: true,
        billingCountryCode: true,
      },
    }),
    prisma.staffMembers.findMany({
      where: { userId },
      select: { organizationId: true },
    }),
    prisma.events.findMany({
      where: {
        OR: [
          { hostId: userId },
          { assistantHostIds: { has: userId } },
        ],
      },
      select: { id: true, name: true, start: true, state: true },
      orderBy: { start: 'desc' },
      take: 25,
    }),
    prisma.teamRegistrations.findMany({
      where: { userId },
      select: { teamId: true, status: true, rosterRole: true },
      orderBy: { updatedAt: 'desc' },
      take: 25,
    }),
    prisma.teamStaffAssignments.findMany({
      where: { userId },
      select: { teamId: true, status: true, role: true },
      orderBy: { updatedAt: 'desc' },
      take: 25,
    }),
  ]);

  if (!profile && !authUser && !sensitiveUser) {
    notFound();
  }

  const staffOrganizationIds = Array.from(new Set(
    staffMemberships.map((membership) => membership.organizationId).filter(Boolean),
  ));
  const ownedOrganizations = await prisma.organizations.findMany({
    where: {
      OR: [
        { ownerId: userId },
        ...(staffOrganizationIds.length > 0 ? [{ id: { in: staffOrganizationIds } }] : []),
      ],
    },
    select: { id: true, name: true, ownerId: true },
    orderBy: { name: 'asc' },
    take: 25,
  });

  const normalizedProfile = profile ? applyNameCaseToUserFields(profile) : null;
  const displayName = [normalizedProfile?.firstName, normalizedProfile?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim() || normalizedProfile?.userName || authUser?.email || userId;
  const teamIds = Array.from(new Set([
    ...teamRegistrations.map((row) => row.teamId),
    ...staffAssignments.map((row) => row.teamId),
  ])).filter(Boolean);
  const teams = teamIds.length > 0
    ? await prisma.canonicalTeams.findMany({
        where: { id: { in: teamIds } },
        select: { id: true, name: true, organizationId: true },
        orderBy: { name: 'asc' },
      })
    : [];
  const teamsById = new Map(teams.map((team) => [team.id, team]));

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gray-50 py-8">
        <Container fluid>
          <Group justify="space-between" mb="md">
            <div>
              <Title order={2}>{displayName}</Title>
              <Text size="sm" c="dimmed">Admin user profile</Text>
            </div>
            <Button component="a" href="/admin" variant="default">
              Back to admin
            </Button>
          </Group>

          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
            <Paper withBorder radius="md" p="md">
              <Title order={4} mb="sm">Account</Title>
              <table className="w-full text-sm">
                <tbody>
                  <InfoRow label="User ID" value={userId} />
                  <InfoRow label="Username" value={normalizedProfile?.userName} />
                  <InfoRow label="Email" value={authUser?.email ?? sensitiveUser?.email} />
                  <InfoRow label="Verified" value={authUser?.emailVerifiedAt ? 'Yes' : 'No'} />
                  <InfoRow label="Status" value={authUser?.disabledAt ? 'Suspended' : 'Active'} />
                  <InfoRow label="Disabled reason" value={authUser?.disabledReason} />
                  <InfoRow label="Created" value={authUser?.createdAt ?? normalizedProfile?.createdAt} />
                  <InfoRow label="Updated" value={authUser?.updatedAt ?? normalizedProfile?.updatedAt} />
                </tbody>
              </table>
            </Paper>

            <Paper withBorder radius="md" p="md">
              <Title order={4} mb="sm">Billing Address</Title>
              <table className="w-full text-sm">
                <tbody>
                  <InfoRow label="City" value={sensitiveUser?.billingCity} />
                  <InfoRow label="State" value={sensitiveUser?.billingState} />
                  <InfoRow label="Country" value={sensitiveUser?.billingCountryCode} />
                </tbody>
              </table>
            </Paper>
          </SimpleGrid>

          <Paper withBorder radius="md" p="md" mt="md">
            <Title order={4} mb="sm">Organizations</Title>
            {ownedOrganizations.length > 0 ? (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="px-3 py-2 font-semibold">Organization</th>
                    <th className="px-3 py-2 font-semibold">Role</th>
                    <th className="px-3 py-2 font-semibold">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {ownedOrganizations.map((organization) => (
                    <tr key={organization.id} className="border-b border-slate-100 odd:bg-slate-50/60 hover:bg-slate-100/70">
                      <td className="px-3 py-2">
                        <Link href={`/organizations/${organization.id}`}>{organization.name}</Link>
                      </td>
                      <td className="px-3 py-2">{organization.ownerId === userId ? 'Owner' : 'Staff'}</td>
                      <td className="px-3 py-2">{organization.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Text c="dimmed">No organization relationships found.</Text>
            )}
          </Paper>

          <Paper withBorder radius="md" p="md" mt="md">
            <Title order={4} mb="sm">Events</Title>
            {hostedEvents.length > 0 ? (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="px-3 py-2 font-semibold">Event</th>
                    <th className="px-3 py-2 font-semibold">Start</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {hostedEvents.map((event) => (
                    <tr key={event.id} className="border-b border-slate-100 odd:bg-slate-50/60 hover:bg-slate-100/70">
                      <td className="px-3 py-2">
                        <Link href={`/events/${event.id}?tab=details&mode=edit`}>{event.name}</Link>
                      </td>
                      <td className="px-3 py-2">{formatValue(event.start)}</td>
                      <td className="px-3 py-2"><Badge variant="light">{event.state ?? 'PUBLISHED'}</Badge></td>
                      <td className="px-3 py-2">{event.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Text c="dimmed">No hosted event relationships found.</Text>
            )}
          </Paper>

          <Paper withBorder radius="md" p="md" mt="md">
            <Title order={4} mb="sm">Teams</Title>
            {teamIds.length > 0 ? (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="px-3 py-2 font-semibold">Team</th>
                    <th className="px-3 py-2 font-semibold">Role</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {[...teamRegistrations, ...staffAssignments].map((row) => {
                    const team = teamsById.get(row.teamId);
                    const href = buildTeamManagementPath(team?.id ?? row.teamId);
                    return (
                      <tr key={`${row.teamId}:${'role' in row ? row.role : row.rosterRole}`} className="border-b border-slate-100 odd:bg-slate-50/60 hover:bg-slate-100/70">
                        <td className="px-3 py-2">
                          <Link href={href}>{team?.name ?? row.teamId}</Link>
                        </td>
                        <td className="px-3 py-2">{'role' in row ? row.role : row.rosterRole}</td>
                        <td className="px-3 py-2"><Badge variant="light">{row.status}</Badge></td>
                        <td className="px-3 py-2">{row.teamId}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <Text c="dimmed">No team relationships found.</Text>
            )}
          </Paper>
        </Container>
      </div>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: unknown }) {
  return (
    <tr>
      <td className="w-44 py-1.5 pr-4 align-top">
        <Text size="sm" c="dimmed">{label}</Text>
      </td>
      <td className="py-1.5 align-top">
        <Text size="sm">{formatValue(value)}</Text>
      </td>
    </tr>
  );
}

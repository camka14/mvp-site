import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Navigation from '@/components/layout/Navigation';
import { prisma } from '@/lib/prisma';
import { applyNameCaseToUserFields } from '@/lib/nameCase';
import { resolveRazumlyAdminFromToken } from '@/server/razumlyAdmin';
import { Badge, Button, Container, Group, Paper, SimpleGrid, Table, Text, Title } from '@mantine/core';

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
            <Button component={Link} href="/admin" variant="default">
              Back to admin
            </Button>
          </Group>

          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
            <Paper withBorder radius="md" p="md">
              <Title order={4} mb="sm">Account</Title>
              <Table withRowBorders={false}>
                <Table.Tbody>
                  <InfoRow label="User ID" value={userId} />
                  <InfoRow label="Username" value={normalizedProfile?.userName} />
                  <InfoRow label="Email" value={authUser?.email ?? sensitiveUser?.email} />
                  <InfoRow label="Verified" value={authUser?.emailVerifiedAt ? 'Yes' : 'No'} />
                  <InfoRow label="Status" value={authUser?.disabledAt ? 'Suspended' : 'Active'} />
                  <InfoRow label="Disabled reason" value={authUser?.disabledReason} />
                  <InfoRow label="Created" value={authUser?.createdAt ?? normalizedProfile?.createdAt} />
                  <InfoRow label="Updated" value={authUser?.updatedAt ?? normalizedProfile?.updatedAt} />
                </Table.Tbody>
              </Table>
            </Paper>

            <Paper withBorder radius="md" p="md">
              <Title order={4} mb="sm">Billing Address</Title>
              <Table withRowBorders={false}>
                <Table.Tbody>
                  <InfoRow label="City" value={sensitiveUser?.billingCity} />
                  <InfoRow label="State" value={sensitiveUser?.billingState} />
                  <InfoRow label="Country" value={sensitiveUser?.billingCountryCode} />
                </Table.Tbody>
              </Table>
            </Paper>
          </SimpleGrid>

          <Paper withBorder radius="md" p="md" mt="md">
            <Title order={4} mb="sm">Organizations</Title>
            {ownedOrganizations.length > 0 ? (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Organization</Table.Th>
                    <Table.Th>Role</Table.Th>
                    <Table.Th>ID</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {ownedOrganizations.map((organization) => (
                    <Table.Tr key={organization.id}>
                      <Table.Td>
                        <Link href={`/organizations/${organization.id}`}>{organization.name}</Link>
                      </Table.Td>
                      <Table.Td>{organization.ownerId === userId ? 'Owner' : 'Staff'}</Table.Td>
                      <Table.Td>{organization.id}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            ) : (
              <Text c="dimmed">No organization relationships found.</Text>
            )}
          </Paper>

          <Paper withBorder radius="md" p="md" mt="md">
            <Title order={4} mb="sm">Events</Title>
            {hostedEvents.length > 0 ? (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Event</Table.Th>
                    <Table.Th>Start</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>ID</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {hostedEvents.map((event) => (
                    <Table.Tr key={event.id}>
                      <Table.Td>
                        <Link href={`/events/${event.id}?tab=details&mode=edit`}>{event.name}</Link>
                      </Table.Td>
                      <Table.Td>{formatValue(event.start)}</Table.Td>
                      <Table.Td><Badge variant="light">{event.state ?? 'PUBLISHED'}</Badge></Table.Td>
                      <Table.Td>{event.id}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            ) : (
              <Text c="dimmed">No hosted event relationships found.</Text>
            )}
          </Paper>

          <Paper withBorder radius="md" p="md" mt="md">
            <Title order={4} mb="sm">Teams</Title>
            {teamIds.length > 0 ? (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Team</Table.Th>
                    <Table.Th>Role</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>ID</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {[...teamRegistrations, ...staffAssignments].map((row) => {
                    const team = teamsById.get(row.teamId);
                    const href = team?.organizationId
                      ? `/organizations/${team.organizationId}?tab=teams&teamId=${team.id}`
                      : `/teams?teamId=${row.teamId}`;
                    return (
                      <Table.Tr key={`${row.teamId}:${'role' in row ? row.role : row.rosterRole}`}>
                        <Table.Td>
                          <Link href={href}>{team?.name ?? row.teamId}</Link>
                        </Table.Td>
                        <Table.Td>{'role' in row ? row.role : row.rosterRole}</Table.Td>
                        <Table.Td><Badge variant="light">{row.status}</Badge></Table.Td>
                        <Table.Td>{row.teamId}</Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
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
    <Table.Tr>
      <Table.Td w={180}>
        <Text size="sm" c="dimmed">{label}</Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{formatValue(value)}</Text>
      </Table.Td>
    </Table.Tr>
  );
}

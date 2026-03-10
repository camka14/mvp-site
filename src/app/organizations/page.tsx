'use client';

import { Suspense, useEffect, useState } from 'react';
import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import OrganizationCard from '@/components/ui/OrganizationCard';
import CreateOrganizationModal from '@/components/ui/CreateOrganizationModal';
import ResponsiveCardGrid from '@/components/ui/ResponsiveCardGrid';
import { Container, Title, Text, Group, Button, Paper, Stack } from '@mantine/core';
import { useApp } from '@/app/providers';
import type { Invite, Organization, UserData } from '@/types';
import { organizationService } from '@/lib/organizationService';
import { userService } from '@/lib/userService';
import { useRouter } from 'next/navigation';

export default function OrganizationsPage() {
  return (
    <Suspense fallback={<Loading fullScreen text="Loading organizations..." />}>
      <OrganizationsPageContent />
    </Suspense>
  );
}

function OrganizationsPageContent() {
  const { user, loading: authLoading, isAuthenticated } = useApp();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [pendingOrgInvites, setPendingOrgInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated || !user) {
        router.push('/login');
        return;
      }
      loadOrgs(user.$id);
    }
  }, [authLoading, isAuthenticated, user, router]);

  const loadOrgs = async (ownerId: string) => {
    setLoading(true);
    try {
      const [list, invites] = await Promise.all([
        organizationService.getOrganizationsByUser(ownerId),
        userService.listInvites({ userId: ownerId, type: 'STAFF' }),
      ]);
      const nextPendingInvites = invites.filter((invite) => invite.status === 'PENDING' && Boolean(invite.organizationId));
      const pendingOrganizationIds = nextPendingInvites
        .map((invite) => invite.organizationId)
        .filter((organizationId): organizationId is string => typeof organizationId === 'string' && organizationId.length > 0);
      const invitedOrganizations = pendingOrganizationIds.length
        ? await organizationService.getOrganizationsByIds(pendingOrganizationIds)
        : [];
      const organizationsById = new Map<string, Organization>();
      [...list, ...invitedOrganizations].forEach((organization) => {
        organizationsById.set(organization.$id, organization);
      });
      setOrgs(Array.from(organizationsById.values()));
      setPendingOrgInvites(nextPendingInvites);
    } catch (e) {
      console.error('Failed to load organizations', e);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) return <Loading fullScreen text="Loading organizations..." />;
  if (!isAuthenticated || !user) return null;

  const pendingInviteByOrganizationId = new Map(
    pendingOrgInvites
      .filter((invite) => typeof invite.organizationId === 'string')
      .map((invite) => [invite.organizationId as string, invite] as const),
  );

  return (
    <>
      <Navigation />
      <Container fluid py="xl">
        <Group justify="space-between" align="center" mb="lg">
          <div>
            <Title order={2} mb={4}>Organizations</Title>
            <Text c="dimmed">Manage your organizations and dashboards</Text>
          </div>
          <Button onClick={() => setShowCreate(true)}>+ Create Organization</Button>
        </Group>

        {loading ? (
          <ResponsiveCardGrid>
            {Array.from({ length: 6 }).map((_, i) => (
              <Paper key={`org-skel-${i}`} withBorder radius="md" p="md" h={120} className="skeleton" />
            ))}
          </ResponsiveCardGrid>
        ) : orgs.length > 0 ? (
          <ResponsiveCardGrid>
            {orgs.map((org) => {
              const invite = pendingInviteByOrganizationId.get(org.$id);
              if (!invite) {
                return (
                  <OrganizationCard
                    key={org.$id}
                    organization={org}
                    onClick={() => router.push(`/organizations/${org.$id}`)}
                  />
                );
              }
              return (
                <OrganizationCard
                  key={org.$id}
                  organization={org}
                  actions={(
                    <Stack gap={6}>
                      <Button
                        size="xs"
                        onClick={async (event) => {
                          event.stopPropagation();
                          await userService.acceptInvite(invite.$id);
                          await loadOrgs(user.$id);
                        }}
                      >
                        Accept Invite
                      </Button>
                      <Button
                        size="xs"
                        variant="default"
                        onClick={async (event) => {
                          event.stopPropagation();
                          await userService.declineInvite(invite.$id);
                          await loadOrgs(user.$id);
                        }}
                      >
                        Decline
                      </Button>
                    </Stack>
                  )}
                />
              );
            })}
          </ResponsiveCardGrid>
        ) : (
          <div className="text-center py-16 flex flex-col items-center">
            <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z" />
              </svg>
            </div>
            <Title order={3} mb={6}>No organizations yet</Title>
            <Text c="dimmed" mb="md" ta="center" className="w-full max-w-sm">Create your first organization to host events and manage fields in one place.</Text>
            <Button onClick={() => setShowCreate(true)}>Create Organization</Button>
          </div>
        )}

        <CreateOrganizationModal
          isOpen={showCreate}
          onClose={() => setShowCreate(false)}
          currentUser={user as UserData}
          onCreated={(org) => setOrgs((prev) => [org, ...prev])}
        />
      </Container>
    </>
  );
}

'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import OrganizationCard from '@/components/ui/OrganizationCard';
import CreateOrganizationModal from '@/components/ui/CreateOrganizationModal';
import ResponsiveCardGrid from '@/components/ui/ResponsiveCardGrid';
import { Container, Title, Text, Group, Button, Modal, Paper, Stack } from '@mantine/core';
import { useApp } from '@/app/providers';
import type { Invite, Organization, OrganizationFeature, UserData } from '@/types';
import { organizationService } from '@/lib/organizationService';
import { userService } from '@/lib/userService';
import { buildGuestCreateDestination, buildGuestSignupDestination } from '@/lib/guestOnboarding';
import { useRouter, useSearchParams } from 'next/navigation';

export default function OrganizationsPage() {
  return (
    <Suspense fallback={<Loading fullScreen text="Loading organizations..." />}>
      <OrganizationsPageContent />
    </Suspense>
  );
}

function OrganizationsPageContent() {
  const {
    user,
    authUser,
    loading: authLoading,
    isGuest,
    isAuthenticated,
    requiresEmailVerification,
  } = useApp();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [pendingOrgInvites, setPendingOrgInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showGuestCreatePrompt, setShowGuestCreatePrompt] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const createPreset = searchParams.get('preset') === 'club' ? 'club' : 'organization';
  const requestedCreate = searchParams.get('create') === '1';
  const initialFeatures = useMemo<OrganizationFeature[]>(
    () => createPreset === 'club' ? ['CLUB_TEAMS', 'EVENT_MANAGEMENT'] : ['EVENT_MANAGEMENT'],
    [createPreset],
  );
  const createOrganizationBlocked = requiresEmailVerification
    || authUser?.emailVerified === false
    || authUser?.emailVerifiedAt === null;

  useEffect(() => {
    if (!authLoading) {
      if (isGuest) {
        return;
      }
      if (!isAuthenticated || !user) {
        router.push('/login');
        return;
      }
      loadOrgs(user.$id);
    }
  }, [authLoading, isAuthenticated, isGuest, user, router]);

  useEffect(() => {
    if (!requestedCreate || authLoading) {
      return;
    }
    if (isGuest) {
      setShowGuestCreatePrompt(true);
      return;
    }
    if (isAuthenticated && user && !createOrganizationBlocked) {
      setShowCreate(true);
    }
  }, [authLoading, createOrganizationBlocked, isAuthenticated, isGuest, requestedCreate, user]);

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
  if (!isGuest && (!isAuthenticated || !user)) return null;

  const organizationsLoading = !isGuest && loading;
  const visibleOrganizations = isGuest ? [] : orgs;
  const pendingInviteByOrganizationId = new Map(
    pendingOrgInvites
      .filter((invite) => typeof invite.organizationId === 'string')
      .map((invite) => [invite.organizationId as string, invite] as const),
  );
  const createOrganizationBlockedReason = createOrganizationBlocked
    ? 'Verify your email before creating an organization.'
    : undefined;

  const handleCreateOrganizationClick = () => {
    if (isGuest) {
      setShowGuestCreatePrompt(true);
      return;
    }
    if (createOrganizationBlocked) return;
    setShowCreate(true);
  };
  const handleCloseCreate = () => {
    setShowCreate(false);
    if (requestedCreate) {
      router.replace('/organizations');
    }
  };
  const handleCloseGuestCreatePrompt = () => {
    setShowGuestCreatePrompt(false);
    if (requestedCreate) {
      router.replace('/organizations');
    }
  };
  const handleCreateGuestAccount = () => {
    const target = createPreset === 'club' ? 'club' : 'organization';
    const next = buildGuestCreateDestination(target, '');
    router.push(buildGuestSignupDestination({ target, next }));
  };

  return (
    <>
      <Navigation />
      <Container fluid py="xl">
        <Group justify="space-between" align="center" mb="lg">
          <div>
            <Title order={2} mb={4}>Organizations</Title>
            <Text c="dimmed">Manage your organizations and dashboards</Text>
          </div>
          <Button
            onClick={handleCreateOrganizationClick}
            disabled={createOrganizationBlocked}
            title={createOrganizationBlockedReason}
          >
            + Create Organization
          </Button>
        </Group>

        {organizationsLoading ? (
          <ResponsiveCardGrid>
            {Array.from({ length: 6 }).map((_, i) => (
              <Paper key={`org-skel-${i}`} withBorder radius="md" p="md" h={120} className="skeleton" />
            ))}
          </ResponsiveCardGrid>
        ) : visibleOrganizations.length > 0 ? (
          <ResponsiveCardGrid>
            {visibleOrganizations.map((org) => {
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
                          if (user) {
                            await loadOrgs(user.$id);
                          }
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
                          if (user) {
                            await loadOrgs(user.$id);
                          }
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
            <Text c="dimmed" mb="md" ta="center" className="w-full max-w-sm">
              {isGuest
                ? 'Create an account to create and manage organizations.'
                : 'Create your first organization to host events and manage fields in one place.'}
            </Text>
            <Button
              onClick={handleCreateOrganizationClick}
              disabled={createOrganizationBlocked}
              title={createOrganizationBlockedReason}
            >
              Create Organization
            </Button>
          </div>
        )}

        {user ? (
          <CreateOrganizationModal
            isOpen={showCreate && !createOrganizationBlocked}
            onClose={handleCloseCreate}
            currentUser={user as UserData}
            onCreated={(org) => setOrgs((prev) => [org, ...prev])}
            initialFeatures={initialFeatures}
            initialTagSlugs={createPreset === 'club' ? ['club'] : []}
          />
        ) : null}
        <Modal
          opened={showGuestCreatePrompt}
          onClose={handleCloseGuestCreatePrompt}
          title="Create an account first"
          centered
        >
          <Stack>
            <Text>
              Create an account to create and manage an organization, invite staff, and publish events.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={handleCloseGuestCreatePrompt}>
                Not now
              </Button>
              <Button onClick={handleCreateGuestAccount}>
                Create account
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Container>
    </>
  );
}

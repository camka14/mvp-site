'use client';

import { Suspense, useEffect, useState } from 'react';
import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import OrganizationCard from '@/components/ui/OrganizationCard';
import CreateOrganizationModal from '@/components/ui/CreateOrganizationModal';
import { Container, Title, Text, Group, Button, SimpleGrid, Paper } from '@mantine/core';
import { useApp } from '@/app/providers';
import type { Organization, UserData } from '@/types';
import { organizationService } from '@/lib/organizationService';
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
      const list = await organizationService.getOrganizationsByOwner(ownerId);
      setOrgs(list);
    } catch (e) {
      console.error('Failed to load organizations', e);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) return <Loading fullScreen text="Loading organizations..." />;
  if (!isAuthenticated || !user) return null;

  return (
    <>
      <Navigation />
      <Container size="lg" py="xl">
        <Group justify="space-between" align="center" mb="lg">
          <div>
            <Title order={2} mb={4}>Organizations</Title>
            <Text c="dimmed">Manage your organizations and dashboards</Text>
          </div>
          <Button onClick={() => setShowCreate(true)}>+ Create Organization</Button>
        </Group>

        {loading ? (
          <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
            {Array.from({ length: 6 }).map((_, i) => (
              <Paper key={`org-skel-${i}`} withBorder radius="md" p="md" h={120} className="skeleton" />
            ))}
          </SimpleGrid>
        ) : orgs.length > 0 ? (
          <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
            {orgs.map((org) => (
              <OrganizationCard key={org.$id} organization={org} onClick={() => router.push(`/organizations/${org.$id}`)} />
            ))}
          </SimpleGrid>
        ) : (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z" />
              </svg>
            </div>
            <Title order={3} mb={6}>No organizations yet</Title>
            <Text c="dimmed" mb="md" className="max-w-sm mx-auto">Create your first organization to host events and manage fields in one place.</Text>
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

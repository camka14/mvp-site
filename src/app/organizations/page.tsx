'use client';

import { Suspense, useEffect, useState } from 'react';
import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import OrganizationCard from '@/components/ui/OrganizationCard';
import CreateOrganizationModal from '@/components/ui/CreateOrganizationModal';
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
      <div className="container-responsive py-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Organizations</h1>
            <p className="text-gray-600">Manage your organizations and dashboards</p>
          </div>
          <button className="btn-primary whitespace-nowrap" onClick={() => setShowCreate(true)}>+ Create Organization</button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={`org-skel-${i}`} className="card"><div className="card-content"><div className="h-24 skeleton rounded" /></div></div>
            ))}
          </div>
        ) : orgs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {orgs.map((org) => (
              <OrganizationCard key={org.$id} organization={org} onClick={() => router.push(`/organizations/${org.$id}`)} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z" />
              </svg>
            </div>
            <h3 className="text-xl font-medium text-gray-900 mb-2">No organizations yet</h3>
            <p className="text-gray-600 mb-6 max-w-sm mx-auto">Create your first organization to host events and manage fields in one place.</p>
            <button className="btn-primary" onClick={() => setShowCreate(true)}>Create Organization</button>
          </div>
        )}

        <CreateOrganizationModal
          isOpen={showCreate}
          onClose={() => setShowCreate(false)}
          currentUser={user as UserData}
          onCreated={(org) => setOrgs((prev) => [org, ...prev])}
        />
      </div>
    </>
  );
}


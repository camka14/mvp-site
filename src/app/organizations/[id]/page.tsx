'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import EventCard from '@/components/ui/EventCard';
import TeamCard from '@/components/ui/TeamCard';
import { useApp } from '@/app/providers';
import type { OrganizationDetail } from '@/types';
import { organizationService } from '@/lib/organizationService';
import { storage } from '@/app/appwrite';

export default function OrganizationDetailPage() {
  return (
    <Suspense fallback={<Loading fullScreen text="Loading organization..." />}>
      <OrganizationDetailContent />
    </Suspense>
  );
}

function OrganizationDetailContent() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading, isAuthenticated } = useApp();
  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'events' | 'teams' | 'fields'>('overview');

  const id = Array.isArray(params?.id) ? params?.id[0] : (params?.id as string);

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated || !user) {
        router.push('/login');
        return;
      }
      if (id) loadOrg(id);
    }
  }, [authLoading, isAuthenticated, user, router, id]);

  const loadOrg = async (orgId: string) => {
    setLoading(true);
    try {
      const data = await organizationService.getOrganizationById(orgId, true);
      if (data) setOrg(data);
    } catch (e) {
      console.error('Failed to load organization', e);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) return <Loading fullScreen text="Loading organization..." />;
  if (!isAuthenticated || !user) return null;

  const logoUrl = org?.logoId
    ? storage.getFilePreview({ bucketId: process.env.NEXT_PUBLIC_IMAGES_BUCKET_ID!, fileId: org.logoId!, width: 64, height: 64 })
    : org?.name
      ? `${process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT}/avatars/initials?name=${encodeURIComponent(org.name)}&width=64&height=64`
      : '';

  return (
    <>
      <Navigation />
      <div className="container-responsive py-8">
        {loading || !org ? (
          <Loading fullScreen={false} text="Loading organization..." />
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
              <div className="flex items-center gap-3">
                {logoUrl && <img src={logoUrl} alt={org.name} className="w-16 h-16 rounded-full border" />}
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">{org.name}</h1>
                  <div className="text-gray-600 flex items-center gap-3">
                    {org.website && (
                      <a href={org.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{org.website}</a>
                    )}
                    {org.location && (
                      <span className="text-sm">{org.location}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                {/* Future: actions such as edit org, invite team, etc. */}
                <button className="btn-secondary" onClick={() => router.push('/events')}>Manage Events</button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 mb-8 w-fit">
              {(['overview', 'events', 'teams', 'fields'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${activeTab === tab ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  {tab[0].toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <div className="card"><div className="card-content"><h3 className="font-semibold mb-2">About</h3><p className="text-sm text-gray-700 whitespace-pre-line">{org.description || 'No description'}</p></div></div>
                  <div className="card"><div className="card-content">
                    <h3 className="font-semibold mb-4">Recent Events</h3>
                    {org.events && org.events.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {org.events.slice(0, 4).map((e) => (
                          <EventCard key={e.$id} event={e} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-600">No events yet.</p>
                    )}
                  </div></div>
                </div>
                <div className="space-y-6">
                  <div className="card"><div className="card-content">
                    <h3 className="font-semibold mb-4">Teams</h3>
                    {org.teams && org.teams.length > 0 ? (
                      <div className="space-y-3">
                        {org.teams.slice(0, 3).map((t) => (
                          <TeamCard key={t.$id} team={t} showStats={false} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-600">No teams yet.</p>
                    )}
                  </div></div>
                </div>
              </div>
            )}

            {activeTab === 'events' && (
              <div className="card"><div className="card-content">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Events</h3>
                  <button className="btn-primary" onClick={() => router.push('/events')}>Create Event</button>
                </div>
                {org.events && org.events.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {org.events.map((e) => (
                      <EventCard key={e.$id} event={e} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">No events yet.</p>
                )}
              </div></div>
            )}

            {activeTab === 'teams' && (
              <div className="card"><div className="card-content">
                <h3 className="font-semibold mb-4">Teams</h3>
                {org.teams && org.teams.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {org.teams.map((t) => (
                      <TeamCard key={t.$id} team={t} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">No teams yet.</p>
                )}
              </div></div>
            )}

            {activeTab === 'fields' && (
              <div className="card"><div className="card-content">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Fields</h3>
                  <button className="btn-secondary" onClick={() => router.push('/events')}>Manage Fields</button>
                </div>
                {org.fields && org.fields.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {org.fields.map((f) => (
                      <div key={f.$id} className="p-4 rounded-lg border bg-white">
                        <div className="font-medium text-gray-900">{f.name || `Field ${f.fieldNumber}`}</div>
                        <div className="text-sm text-gray-600">{f.type || '—'}</div>
                        {f.location && <div className="text-xs text-gray-500 mt-1">{f.location}</div>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">No fields yet.</p>
                )}
              </div></div>
            )}
          </>
        )}
      </div>
    </>
  );
}


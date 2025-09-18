"use client";

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import { Container, Group, Title, Text, Button, Paper, SegmentedControl, SimpleGrid } from '@mantine/core';
import EventCard from '@/components/ui/EventCard';
import TeamCard from '@/components/ui/TeamCard';
import { useApp } from '@/app/providers';
import type { OrganizationDetail } from '@/types';
import { organizationService } from '@/lib/organizationService';
import { storage } from '@/app/appwrite';
import EventCreationModal from '@/app/events/components/EventCreationModal';
import EventDetailModal from '@/app/events/components/EventDetailModal';
import CreateTeamModal from '@/components/ui/CreateTeamModal';
import CreateFieldModal from '@/components/ui/CreateFieldModal';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Calendar as BigCalendar, dateFnsLocalizer, View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';

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
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [showCreateFieldModal, setShowCreateFieldModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [showEventDetailModal, setShowEventDetailModal] = useState(false);
  const [calendarView, setCalendarView] = useState<View>('month');
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());

  const localizer = useMemo(() => dateFnsLocalizer({
    format,
    parse: parse as any,
    startOfWeek,
    getDay,
    locales: {} as any,
  }), []);

  const id = Array.isArray(params?.id) ? params?.id[0] : (params?.id as string);

  // Custom event renderer to show start/end times on cards
  const CalendarEvent: any = ({ event }: any) => {
    const s: Date = event.start instanceof Date ? event.start : new Date(event.start);
    const e: Date = event.end instanceof Date ? event.end : new Date(event.end);
    const times = `${format(s, 'p')} - ${format(e, 'p')}`; // e.g., 2:00 PM - 3:30 PM
    const title = event.resource?.name || event.title;
    return (
      <div className="leading-tight">
        <div className="text-[11px] opacity-90">{times}</div>
        <div className="truncate">{title}</div>
      </div>
    );
  };

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
      <Container size="lg" py="xl">
        {loading || !org ? (
          <Loading fullScreen={false} text="Loading organization..." />
        ) : (
          <>
            {/* Header */}
            <Group justify="space-between" align="center" mb="lg">
              <Group gap="md">
                {logoUrl && <img src={logoUrl} alt={org.name} style={{ width: 64, height: 64, borderRadius: '9999px', border: '1px solid #e5e7eb' }} />}
                <div>
                  <Title order={2} mb={2}>{org.name}</Title>
                  <Group gap="md">
                    {org.website && (
                      <a href={org.website} target="_blank" rel="noreferrer"><Text c="blue">{org.website}</Text></a>
                    )}
                    {org.location && (
                      <Text size="sm" c="dimmed">{org.location}</Text>
                    )}
                  </Group>
                </div>
              </Group>
              <Group>
                <Button variant="default" onClick={() => router.push('/events')}>Manage Events</Button>
              </Group>
            </Group>

            {/* Tabs */}
            <SegmentedControl
              value={activeTab}
              onChange={(v: any) => setActiveTab(v)}
              data={[
                { label: 'Overview', value: 'overview' },
                { label: 'Events', value: 'events' },
                { label: 'Teams', value: 'teams' },
                { label: 'Fields', value: 'fields' },
              ]}
              mb="lg"
            />

            {activeTab === 'overview' && (
              <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="lg">
                <div style={{ gridColumn: 'span 2' }}>
                  <Paper withBorder p="md" radius="md" mb="md">
                    <Title order={5} mb="xs">About</Title>
                    <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-line' }}>{org.description || 'No description'}</Text>
                  </Paper>
                  <Paper withBorder p="md" radius="md">
                    <Title order={5} mb="md">Recent Events</Title>
                    {org.events && org.events.length > 0 ? (
                      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                        {org.events.slice(0, 4).map((e) => (
                          <EventCard
                            key={e.$id}
                            event={e}
                            onClick={() => { setSelectedEvent(e); setShowEventDetailModal(true); }}
                          />
                        ))}
                      </SimpleGrid>
                    ) : (
                      <Text size="sm" c="dimmed">No events yet.</Text>
                    )}
                  </Paper>
                </div>
                <div>
                  <Paper withBorder p="md" radius="md">
                    <Title order={5} mb="md">Teams</Title>
                    {org.teams && org.teams.length > 0 ? (
                      <div className="space-y-3">
                        {org.teams.slice(0, 3).map((t) => (
                          <TeamCard key={t.$id} team={t} showStats={false} />
                        ))}
                      </div>
                    ) : (
                      <Text size="sm" c="dimmed">No teams yet.</Text>
                    )}
                  </Paper>
                </div>
              </SimpleGrid>
            )}

            {activeTab === 'events' && (
              <Paper withBorder p="md" radius="md">
                <Group justify="space-between" mb="sm">
                  <Title order={5}>Events Calendar</Title>
                  <Group gap="xs">
                    {(['month','week','day','agenda'] as View[]).map(v => (
                      <Button key={v} variant={calendarView===v ? 'filled' : 'default'} size="xs" onClick={() => setCalendarView(v)}>
                        {String(v).charAt(0).toUpperCase()+String(v).slice(1)}
                      </Button>
                    ))}
                    <Button onClick={() => setShowCreateEventModal(true)}>+ Create Event</Button>
                  </Group>
                </Group>
                <div className="h-[800px]">
                  <BigCalendar
                      localizer={localizer}
                      events={(org.events || []).map(e => ({
                        title: e.name,
                        start: new Date(e.start),
                        end: new Date(e.end),
                        resource: e,
                      }))}
                      startAccessor="start"
                      endAccessor="end"
                      views={["month","week","day","agenda"]}
                      view={calendarView}
                      date={calendarDate}
                      onView={(v) => setCalendarView(v)}
                      onNavigate={(date) => setCalendarDate(date)}
                      step={30}
                      popup
                      selectable
                      components={{ event: CalendarEvent, month: { event: CalendarEvent } as any }}
                      onSelectEvent={(evt: any) => { setSelectedEvent(evt.resource); setShowEventDetailModal(true); }}
                      onSelectSlot={() => setShowCreateEventModal(true)}
                  />
                </div>
              </Paper>
            )}

            {activeTab === 'teams' && (
              <Paper withBorder p="md" radius="md">
                <Group justify="space-between" mb="md">
                  <Title order={5}>Teams</Title>
                  <Button onClick={() => setShowCreateTeamModal(true)}>Create Team</Button>
                </Group>
                {org.teams && org.teams.length > 0 ? (
                  <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
                    {org.teams.map((t) => (
                      <TeamCard key={t.$id} team={t} />
                    ))}
                  </SimpleGrid>
                ) : (
                  <Text size="sm" c="dimmed">No teams yet.</Text>
                )}
              </Paper>
            )}

            {activeTab === 'fields' && (
              <Paper withBorder p="md" radius="md">
                <Group justify="space-between" mb="md">
                  <Title order={5}>Fields</Title>
                  <Group gap="xs">
                    <Button variant="default" onClick={() => router.push('/events')}>Manage Fields</Button>
                    <Button onClick={() => setShowCreateFieldModal(true)}>Create Field</Button>
                  </Group>
                </Group>
                {org.fields && org.fields.length > 0 ? (
                  <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
                    {org.fields.map((f) => (
                      <Paper key={f.$id} withBorder p="md" radius="md">
                        <Text fw={500}>{f.name || `Field ${f.fieldNumber}`}</Text>
                        <Text size="sm" c="dimmed">{f.type || '—'}</Text>
                        {f.location && <Text size="xs" c="dimmed" mt={4}>{f.location}</Text>}
                      </Paper>
                    ))}
                  </SimpleGrid>
                ) : (
                  <Text size="sm" c="dimmed">No fields yet.</Text>
                )}
              </Paper>
            )}
          </>
        )}
      </Container>

      {/* Modals */}
      <EventDetailModal
        event={selectedEvent!}
        isOpen={showEventDetailModal}
        onClose={() => { setShowEventDetailModal(false); setSelectedEvent(null); }}
      />
      <EventCreationModal
        isOpen={showCreateEventModal}
        onClose={() => setShowCreateEventModal(false)}
        onEventCreated={async () => { setShowCreateEventModal(false); if (id) await loadOrg(id); }}
        currentUser={user}
        organizationId={id}
      />
      <CreateTeamModal
        isOpen={showCreateTeamModal}
        onClose={() => setShowCreateTeamModal(false)}
        currentUser={user}
        onTeamCreated={async () => { setShowCreateTeamModal(false); if (id) await loadOrg(id); }}
      />
      <CreateFieldModal
        isOpen={showCreateFieldModal}
        onClose={() => setShowCreateFieldModal(false)}
        organizationId={id}
        onFieldCreated={async () => { setShowCreateFieldModal(false); if (id) await loadOrg(id); }}
      />
    </>
  );
}

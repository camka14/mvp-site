"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import { Container, Group, Title, Text, Button, Paper, SegmentedControl, SimpleGrid, Tabs, Pagination } from '@mantine/core';
import EventCard from '@/components/ui/EventCard';
import TeamCard from '@/components/ui/TeamCard';
import { useApp } from '@/app/providers';
import type { Field, Organization } from '@/types';
import { organizationService } from '@/lib/organizationService';
import { storage } from '@/app/appwrite';
import EventCreationModal from '@/app/events/components/EventCreationModal';
import EventDetailModal from '@/app/events/components/EventDetailModal';
import CreateTeamModal from '@/components/ui/CreateTeamModal';
import CreateFieldModal from '@/components/ui/CreateFieldModal';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Calendar as BigCalendar, dateFnsLocalizer, View } from 'react-big-calendar';
import { format, parse, startOfWeek, endOfWeek, startOfDay, endOfDay, startOfMonth, endOfMonth, getDay, formatISO } from 'date-fns';
import { fieldService } from '@/lib/fieldService';
import { buildFieldCalendarEvents } from './fieldCalendar';

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
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'events' | 'teams' | 'fields'>('overview');
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [showCreateFieldModal, setShowCreateFieldModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [showEventDetailModal, setShowEventDetailModal] = useState(false);
  const [calendarView, setCalendarView] = useState<View>('month');
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [fieldViewMode, setFieldViewMode] = useState<'list' | 'schedule'>('list');
  const [fieldCalendarView, setFieldCalendarView] = useState<View>('week');
  const [fieldCalendarDate, setFieldCalendarDate] = useState<Date>(new Date());
  const [fieldScheduleLoading, setFieldScheduleLoading] = useState(false);
  const [fieldScheduleFields, setFieldScheduleFields] = useState<Field[]>([]);
  const [fieldScheduleSelectedFieldId, setFieldScheduleSelectedFieldId] = useState<string | null>(null);

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

  const computeFieldRange = useMemo(() => {
    return (view: View, date: Date) => {
      switch (view) {
        case 'day':
          return { start: startOfDay(date), end: endOfDay(date) };
        case 'month':
          return { start: startOfMonth(date), end: endOfMonth(date) };
        case 'agenda':
        case 'week':
        default:
          return {
            start: startOfWeek(date, { weekStartsOn: 0 }),
            end: endOfWeek(date, { weekStartsOn: 0 }),
          };
      }
    };
  }, []);

  const handleFieldRangeChange = useCallback((range: any) => {
    if (Array.isArray(range) && range.length > 0) {
      setFieldCalendarDate(range[0]);
      return;
    }
    if (range?.start) {
      setFieldCalendarDate(range.start);
    }
  }, []);

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

  const loadFieldSchedule = useCallback(async (view: View, date: Date) => {
    if (!id) return;
    const { start, end } = computeFieldRange(view, date);
    const startLocal = formatISO(start, { representation: 'complete' });
    const endLocal = formatISO(end, { representation: 'complete' });
    setFieldScheduleLoading(true);
    try {
      const fields = await fieldService.listFields(
        { organizationId: id },
        {
          start: startLocal,
          end: endLocal,
        }
      );
      setFieldScheduleFields(fields);
    } catch (error) {
      console.error('Failed to load field schedule:', error);
      setFieldScheduleFields([]);
    } finally {
      setFieldScheduleLoading(false);
    }
  }, [computeFieldRange, id]);

  useEffect(() => {
    if (activeTab === 'fields' && fieldViewMode === 'schedule') {
      loadFieldSchedule(fieldCalendarView, fieldCalendarDate);
    }
  }, [activeTab, fieldViewMode, fieldCalendarView, fieldCalendarDate, loadFieldSchedule]);

  const sortedFieldScheduleFields = useMemo(() => {
    return [...fieldScheduleFields].sort((a, b) => {
      const aNumber = typeof a.fieldNumber === 'number' ? a.fieldNumber : Number.MAX_SAFE_INTEGER;
      const bNumber = typeof b.fieldNumber === 'number' ? b.fieldNumber : Number.MAX_SAFE_INTEGER;
      if (aNumber !== bNumber) {
        return aNumber - bNumber;
      }
      const aName = a.name || '';
      const bName = b.name || '';
      return aName.localeCompare(bName);
    });
  }, [fieldScheduleFields]);

  useEffect(() => {
    if (sortedFieldScheduleFields.length === 0) {
      if (fieldScheduleSelectedFieldId !== null) {
        setFieldScheduleSelectedFieldId(null);
      }
      return;
    }

    if (!fieldScheduleSelectedFieldId || !sortedFieldScheduleFields.some((field) => field.$id === fieldScheduleSelectedFieldId)) {
      setFieldScheduleSelectedFieldId(sortedFieldScheduleFields[0].$id);
    }
  }, [sortedFieldScheduleFields, fieldScheduleSelectedFieldId]);

  const fieldScheduleEvents = useMemo(() => buildFieldCalendarEvents(fieldScheduleFields), [fieldScheduleFields]);
  const selectedField = useMemo(
    () => sortedFieldScheduleFields.find((field) => field.$id === fieldScheduleSelectedFieldId) ?? null,
    [sortedFieldScheduleFields, fieldScheduleSelectedFieldId]
  );
  const activeField = selectedField ?? (sortedFieldScheduleFields.length ? sortedFieldScheduleFields[0] : null);
  const activeFieldIndex = useMemo(() => {
    if (!activeField) return -1;
    return sortedFieldScheduleFields.findIndex((field) => field.$id === activeField.$id);
  }, [sortedFieldScheduleFields, activeField]);
  const filteredFieldScheduleEvents = useMemo(() => {
    if (!activeField) {
      return [];
    }
    return fieldScheduleEvents.filter((entry) => entry.resourceId === activeField.$id);
  }, [fieldScheduleEvents, activeField]);
  const shouldUseTabsForFields = sortedFieldScheduleFields.length > 0 && sortedFieldScheduleFields.length <= 5;

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
                  <Button onClick={() => setShowCreateEventModal(true)}>+ Create Event</Button>
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
                    <SegmentedControl
                      size="sm"
                      value={fieldViewMode}
                      onChange={(value: string) => setFieldViewMode(value as 'list' | 'schedule')}
                      data={[
                        { label: 'List', value: 'list' },
                        { label: 'Schedule', value: 'schedule' },
                      ]}
                    />
                    <Button onClick={() => setShowCreateFieldModal(true)}>Create Field</Button>
                  </Group>
                </Group>
                {fieldViewMode === 'list' ? (
                  org.fields && org.fields.length > 0 ? (
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
                  )
                ) : (
                  fieldScheduleLoading ? (
                    <div className="py-16">
                      <Loading fullScreen={false} text="Loading field schedule..." />
                    </div>
                  ) : sortedFieldScheduleFields.length === 0 ? (
                    <Text size="sm" c="dimmed">No field schedules available for this timeframe.</Text>
                  ) : (
                    <>
                      {shouldUseTabsForFields ? (
                        <Tabs
                          value={activeField?.$id ?? ''}
                          onChange={(value) => setFieldScheduleSelectedFieldId(value || null)}
                          keepMounted={false}
                        >
                          <Tabs.List mb="md">
                            {sortedFieldScheduleFields.map((field) => (
                              <Tabs.Tab key={field.$id} value={field.$id}>
                                {field.name || `Field ${field.fieldNumber ?? ''}`}
                              </Tabs.Tab>
                            ))}
                          </Tabs.List>
                        </Tabs>
                      ) : (
                        <Group justify="space-between" align="center" mb="md">
                          <Text fw={500}>Select field</Text>
                          <Pagination.Root
                            total={sortedFieldScheduleFields.length}
                            value={activeFieldIndex >= 0 ? activeFieldIndex + 1 : 1}
                            onChange={(page) => {
                              const nextField = sortedFieldScheduleFields[page - 1];
                              setFieldScheduleSelectedFieldId(nextField ? nextField.$id : null);
                            }}
                            siblings={sortedFieldScheduleFields.length}
                            boundaries={0}
                            getItemProps={(page) => {
                              const field = sortedFieldScheduleFields[page - 1];
                              const label = field?.fieldNumber !== undefined ? field.fieldNumber : page;
                              return {
                                children: label,
                                'aria-label': field ? (field.name || `Field ${label}`) : `Field ${label}`,
                              };
                            }}
                          >
                            <Group gap="xs" align="center">
                              <Pagination.Previous />
                              <Pagination.Items />
                              <Pagination.Next />
                            </Group>
                          </Pagination.Root>
                        </Group>
                      )}

                      {activeField && (
                        <Text size="sm" c="dimmed" mb="sm">
                          Viewing schedule for {activeField.name || (activeField.fieldNumber ? `Field ${activeField.fieldNumber}` : 'Selected field')}
                        </Text>
                      )}

                      <div className="h-[800px]">
                        <BigCalendar
                          localizer={localizer}
                          events={filteredFieldScheduleEvents}
                          startAccessor="start"
                          endAccessor="end"
                          view={fieldCalendarView}
                          date={fieldCalendarDate}
                          onView={(v) => setFieldCalendarView(v)}
                          onNavigate={(date) => setFieldCalendarDate(date)}
                          onRangeChange={handleFieldRangeChange}
                          views={["month", "week", "day", "agenda"]}
                          components={{ event: CalendarEvent, month: { event: CalendarEvent } as any }}
                          popup
                          selectable={false}
                          onSelectEvent={(evt: any) => {
                            if (evt.metaType === 'event' && evt.resource) {
                              setSelectedEvent(evt.resource);
                              setShowEventDetailModal(true);
                            }
                          }}
                        />
                      </div>
                    </>
                  )
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
        organization={org}
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

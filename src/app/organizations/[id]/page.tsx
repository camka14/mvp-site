"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import { Container, Group, Title, Text, Button, Paper, SegmentedControl, SimpleGrid, Tabs, Pagination, RangeSlider, Stack, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import EventCard from '@/components/ui/EventCard';
import TeamCard from '@/components/ui/TeamCard';
import UserCard from '@/components/ui/UserCard';
import { useApp } from '@/app/providers';
import type { Field, Organization, TimeSlot, UserData } from '@/types';
import { organizationService } from '@/lib/organizationService';
import { storage } from '@/app/appwrite';
import EventDetailSheet from '@/app/discover/components/EventDetailSheet';
import CreateTeamModal from '@/components/ui/CreateTeamModal';
import CreateFieldModal from '@/components/ui/CreateFieldModal';
import CreateRentalSlotModal from '@/components/ui/CreateRentalSlotModal';
import CreateOrganizationModal from '@/components/ui/CreateOrganizationModal';
import RefundRequestsList from '@/components/ui/RefundRequestsList';
import { paymentService } from '@/lib/paymentService';
import { userService } from '@/lib/userService';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Calendar as BigCalendar, dateFnsLocalizer, View, SlotGroupPropGetter } from 'react-big-calendar';
import { format, parse, startOfWeek, endOfWeek, startOfDay, endOfDay, startOfMonth, endOfMonth, getDay, formatISO } from 'date-fns';
import { fieldService } from '@/lib/fieldService';
import { buildFieldCalendarEvents } from './fieldCalendar';
import { ID } from '@/app/appwrite';

export default function OrganizationDetailPage() {
  return (
    <Suspense fallback={<Loading fullScreen text="Loading organization..." />}>
      <OrganizationDetailContent />
    </Suspense>
  );
}

const formatHourLabel = (hour: number) => {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return format(date, 'h a');
};

const MIN_FIELD_CALENDAR_HEIGHT = 800;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function OrganizationDetailContent() {
  const params = useParams();
  const router = useRouter();
  const { user, authUser, loading: authLoading, isAuthenticated } = useApp();
  const [org, setOrg] = useState<Organization | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'events' | 'teams' | 'fields' | 'referees' | 'refunds'>('overview');
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [showEditOrganizationModal, setShowEditOrganizationModal] = useState(false);
  const [editingField, setEditingField] = useState<Field | null>(null);
  const [showRentalSlotModal, setShowRentalSlotModal] = useState(false);
  const [editingRentalSlot, setEditingRentalSlot] = useState<TimeSlot | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [showEventDetailSheet, setShowEventDetailSheet] = useState(false);
  const [calendarView, setCalendarView] = useState<View>('month');
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [fieldViewMode, setFieldViewMode] = useState<'list' | 'schedule'>('list');
  const [fieldCalendarView, setFieldCalendarView] = useState<View>('week');
  const [fieldCalendarDate, setFieldCalendarDate] = useState<Date>(new Date());
  const [fieldScheduleLoading, setFieldScheduleLoading] = useState(false);
  const [fieldScheduleFields, setFieldScheduleFields] = useState<Field[]>([]);
  const [fieldScheduleRange, setFieldScheduleRange] = useState<{ start: Date; end: Date } | null>(null);
  const [timeRange, setTimeRange] = useState<[number, number]>([8, 22]);
  const [fieldScheduleSelectedFieldId, setFieldScheduleSelectedFieldId] = useState<string | null>(null);
  const [refereeSearch, setRefereeSearch] = useState('');
  const [refereeResults, setRefereeResults] = useState<UserData[]>([]);
  const [refereeSearchLoading, setRefereeSearchLoading] = useState(false);
  const [refereeError, setRefereeError] = useState<string | null>(null);
  const [refereeInvites, setRefereeInvites] = useState<{ firstName: string; lastName: string; email: string }[]>([
    { firstName: '', lastName: '', email: '' },
  ]);
  const [refereeInviteError, setRefereeInviteError] = useState<string | null>(null);
  const [invitingReferees, setInvitingReferees] = useState(false);
  const canCreateRentalSlots = Boolean(org?.location && org.location.trim().length > 0);
  const organizationHasStripeAccount = Boolean(org?.hasStripeAccount);
  const [connectingStripe, setConnectingStripe] = useState(false);
  const [managingStripe, setManagingStripe] = useState(false);
  const [stripeEmail, setStripeEmail] = useState('');
  const [stripeEmailError, setStripeEmailError] = useState<string | null>(null);
  const isOwner = Boolean(user && org && user.$id === org.ownerId);
  const stripeEmailValid = useMemo(
    () => Boolean(stripeEmail && EMAIL_REGEX.test(stripeEmail.trim())),
    [stripeEmail],
  );

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
    const title = event.resource?.name || event.title;
    return (
      <div className="leading-tight">
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

  const currentRefereeIds = useMemo(
    () => (Array.isArray(org?.refIds) ? org.refIds.filter((id): id is string => typeof id === 'string') : []),
    [org?.refIds],
  );

  const currentReferees = useMemo(() => org?.referees ?? [], [org?.referees]);

  const loadOrg = useCallback(async (orgId: string, options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!silent) {
      setLoading(true);
    }
    try {
      const data = await organizationService.getOrganizationById(orgId, true);
      if (data) setOrg(data);
    } catch (e) {
      console.error('Failed to load organization', e);
    } finally {
      if (!silent) {
        setLoading(false);
      }
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
  }, [authLoading, isAuthenticated, user, router, id, loadOrg]);

  useEffect(() => {
    if (!org || !user) return;
    if (stripeEmail) return;
    const fallbackEmail = (org as any)?.email || authUser?.email || '';
    if (fallbackEmail) {
      setStripeEmail(fallbackEmail);
    }
  }, [org, user, authUser, stripeEmail]);

  const handleCreateEvent = useCallback(() => {
    const newId = ID.unique();
    const params = new URLSearchParams({
      create: '1',
      mode: 'edit',
      tab: 'details',
      orgId: id ?? '',
    });
    router.push(`/events/${newId}/schedule?${params.toString()}`);
  }, [id, router]);

  const handleConnectStripeAccount = useCallback(async () => {
    if (!org || !isOwner) return;
    const trimmedEmail = stripeEmail.trim();
    const isValidEmail = EMAIL_REGEX.test(trimmedEmail);
    if (!isValidEmail) {
      setStripeEmailError('Enter a valid email to start Stripe onboarding.');
      return;
    }
    if (typeof window === 'undefined') {
      notifications.show({ color: 'red', message: 'Stripe onboarding is only available in the browser.' });
      return;
    }
    try {
      setStripeEmailError(null);
      setConnectingStripe(true);
      const origin = window.location.origin;
      const basePath = `/organizations/${org.$id}`;
      const refreshUrl = `${origin}${basePath}?stripe=refresh`;
      const returnUrl = `${origin}${basePath}?stripe=return`;
      const result = await paymentService.connectStripeAccount({
        organization: org,
        organizationEmail: trimmedEmail,
        refreshUrl,
        returnUrl,
      });
      if (result?.onboardingUrl) {
        window.open(result.onboardingUrl, '_blank', 'noopener,noreferrer');
      } else {
        notifications.show({ color: 'red', message: 'Stripe onboarding did not return a link. Try again later.' });
      }
    } catch (error) {
      console.error('Failed to connect Stripe account', error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Unable to start Stripe onboarding right now.';
      notifications.show({ color: 'red', message });
    } finally {
      setConnectingStripe(false);
    }
  }, [org, isOwner, stripeEmail]);

  const handleManageStripeAccount = useCallback(async () => {
    if (!org || !isOwner) return;
    if (typeof window === 'undefined') {
      notifications.show({ color: 'red', message: 'Stripe management is only available in the browser.' });
      return;
    }
    try {
      setManagingStripe(true);
      const origin = window.location.origin;
      const basePath = `/organizations/${org.$id}`;
      const refreshUrl = `${origin}${basePath}?stripe=refresh`;
      const returnUrl = `${origin}${basePath}?stripe=return`;
      const result = await paymentService.manageStripeAccount({
        organization: org,
        refreshUrl,
        returnUrl,
      });
      if (result?.onboardingUrl) {
        window.open(result.onboardingUrl, '_blank', 'noopener,noreferrer');
      } else {
        notifications.show({ color: 'red', message: 'Stripe did not return a management link. Try again later.' });
      }
    } catch (error) {
      console.error('Failed to manage Stripe account', error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Unable to open Stripe management right now.';
      notifications.show({ color: 'red', message });
    } finally {
      setManagingStripe(false);
    }
  }, [org, isOwner]);

  const handleSearchReferees = useCallback(
    async (query: string) => {
      setRefereeSearch(query);
      setRefereeError(null);
      if (query.trim().length < 2) {
        setRefereeResults([]);
        return;
      }
      try {
        setRefereeSearchLoading(true);
        const results = await userService.searchUsers(query.trim());
        const filtered = results.filter((candidate) => !currentRefereeIds.includes(candidate.$id));
        setRefereeResults(filtered);
      } catch (error) {
        console.error('Failed to search referees:', error);
        setRefereeError('Failed to search referees. Try again.');
      } finally {
        setRefereeSearchLoading(false);
      }
    },
    [currentRefereeIds],
  );

  const handleAddReferee = useCallback(
    async (referee: UserData) => {
      if (!org || !isOwner) return;
      const nextRefIds = Array.from(new Set([...(org.refIds ?? []), referee.$id]));
      try {
        await organizationService.updateOrganization(org.$id, { refIds: nextRefIds });
        setOrg((prev) => {
          if (!prev) return prev;
          const existingRefs = prev.referees ?? [];
          const nextRefs = existingRefs.some((r) => r.$id === referee.$id) ? existingRefs : [...existingRefs, referee];
          return { ...prev, refIds: nextRefIds, referees: nextRefs };
        });
        setRefereeResults((prev) => prev.filter((candidate) => candidate.$id !== referee.$id));
        notifications.show({
          color: 'green',
          message: `${referee.firstName || referee.userName || 'Referee'} added to roster.`,
        });
      } catch (error) {
        console.error('Failed to add referee:', error);
        notifications.show({ color: 'red', message: 'Failed to add referee.' });
      }
    },
    [org, isOwner],
  );

  const handleInviteRefereeEmails = useCallback(async () => {
    if (!org || !isOwner || !user) return;

    const sanitized = refereeInvites.map((invite) => ({
      firstName: invite.firstName.trim(),
      lastName: invite.lastName.trim(),
      email: invite.email.trim(),
    }));

    for (const invite of sanitized) {
      if (!invite.firstName || !invite.lastName || !EMAIL_REGEX.test(invite.email)) {
        setRefereeInviteError('Enter first, last, and valid email for all invites.');
        return;
      }
    }

    setRefereeInviteError(null);
    setInvitingReferees(true);
    try {
      await userService.inviteUsersByEmail(
        user.$id,
        sanitized.map((invite) => ({
          ...invite,
          type: 'referee' as const,
          organizationId: org.$id,
        })),
      );
      await loadOrg(org.$id, { silent: true });
      notifications.show({
        color: 'green',
        message: 'Referee invites sent. New referees will be added automatically.',
      });
      setRefereeInvites([{ firstName: '', lastName: '', email: '' }]);
    } catch (error) {
      setRefereeInviteError(error instanceof Error ? error.message : 'Failed to invite referees.');
    } finally {
      setInvitingReferees(false);
    }
  }, [org, isOwner, user, refereeInvites]);

  const handleRemoveReferee = useCallback(
    async (refereeId: string) => {
      if (!org || !isOwner) return;
      const nextRefIds = (org.refIds ?? []).filter((id) => id !== refereeId);
      try {
        await organizationService.updateOrganization(org.$id, { refIds: nextRefIds });
        setOrg((prev) => {
          if (!prev) return prev;
          const nextRefs = (prev.referees ?? []).filter((ref) => ref.$id !== refereeId);
          return { ...prev, refIds: nextRefIds, referees: nextRefs };
        });
      } catch (error) {
        console.error('Failed to remove referee:', error);
        notifications.show({ color: 'red', message: 'Failed to remove referee.' });
      }
    },
    [org, isOwner],
  );

  const loadFieldSchedule = useCallback(async (view: View, date: Date) => {
    if (!id) return;
    const { start, end } = computeFieldRange(view, date);
    const startLocal = formatISO(start, { representation: 'complete' });
    const endLocal = formatISO(end, { representation: 'complete' });
    setFieldScheduleLoading(true);
    setFieldScheduleRange({ start: new Date(start.getTime()), end: new Date((end ?? start).getTime()) });
    try {

      if (org?.fields) {
        const fields = await Promise.all(org?.fields.map((field) => fieldService.getFieldEventsMatches(field, { start: startLocal, end: endLocal })));

        setFieldScheduleFields(fields);
      }
    } catch (error) {
      console.error('Failed to load field schedule:', error);
      setFieldScheduleFields([]);
    } finally {
      setFieldScheduleLoading(false);
    }
  }, [computeFieldRange, id, org]);

  const handleRentalSlotSaved = useCallback((newField: Field) => {
    setFieldScheduleFields((prev) => prev.map((field) => {
      if (field.$id !== newField.$id) {
        return field;
      }

      return newField;
    }));

    setOrg((prev) => {
      if (!prev || !prev.fields) {
        return prev;
      }

      const nextFields = prev.fields.map((field) => {
        if (field.$id !== newField.$id) {
          return field;
        }

        return newField;
      });

      return { ...prev, fields: nextFields };
    });
    setShowRentalSlotModal(false);
    setEditingRentalSlot(null);
  }, [setFieldScheduleFields, setOrg, setShowRentalSlotModal, setEditingRentalSlot]);

  const handleFieldSaved = useCallback((savedField: Field) => {
    setOrg((prev) => {
      if (!prev) {
        return prev;
      }

      const existing = Array.isArray(prev.fields) ? [...prev.fields] : [];
      const index = existing.findIndex((field) => field.$id === savedField.$id);
      if (index >= 0) {
        existing[index] = savedField;
      } else {
        existing.push(savedField);
      }

      return { ...prev, fields: existing };
    });

    setFieldScheduleFields((prev) => {
      const list = [...prev];
      const index = list.findIndex((field) => field.$id === savedField.$id);
      if (index >= 0) {
        list[index] = savedField;
        return list;
      }

      list.push(savedField);
      return list;
    });

    setShowFieldModal(false);
    setEditingField(null);
  }, []);

  useEffect(() => {
    if (activeTab === 'fields' && fieldViewMode === 'schedule') {
      loadFieldSchedule(fieldCalendarView, fieldCalendarDate);
    }
  }, [activeTab, fieldViewMode, fieldCalendarView, fieldCalendarDate, loadFieldSchedule]);

  useEffect(() => {
    if (activeTab !== 'fields' || fieldViewMode !== 'schedule') {
      setShowRentalSlotModal(false);
      setEditingRentalSlot(null);
    }
  }, [activeTab, fieldViewMode]);

  useEffect(() => {
    if (activeTab !== 'fields') {
      setShowFieldModal(false);
      setEditingField(null);
    }
  }, [activeTab]);

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

  const fieldScheduleEvents = useMemo(() => buildFieldCalendarEvents(fieldScheduleFields, fieldScheduleRange), [fieldScheduleFields, fieldScheduleRange]);
  const defaultTimeRange = useMemo<[number, number]>(() => {
    if (!fieldScheduleEvents.length) {
      return [8, 22];
    }

    let earliest = 24;
    let latest = 0;
    fieldScheduleEvents.forEach((event) => {
      const startHour = event.start.getHours() + event.start.getMinutes() / 60;
      const endHour = event.end.getHours() + event.end.getMinutes() / 60;
      earliest = Math.min(earliest, startHour);
      latest = Math.max(latest, endHour);
    });

    const floor = Math.max(0, Math.floor(earliest));
    const ceil = Math.min(24, Math.ceil(latest));
    if (floor === ceil) {
      const adjusted = Math.min(24, floor + 1);
      return [Math.max(0, adjusted - 1), adjusted];
    }
    return [floor, ceil];
  }, [fieldScheduleEvents]);

  useEffect(() => {
    setTimeRange(defaultTimeRange);
  }, [defaultTimeRange]);

  const showTimeRangeSlider = fieldCalendarView === 'week' || fieldCalendarView === 'day';
  const visibleHourSpan = useMemo(() => Math.max(1, timeRange[1] - timeRange[0]), [timeRange]);

  const slotGroupPropGetter = useCallback<SlotGroupPropGetter>(() => {
    const baseHeight = MIN_FIELD_CALENDAR_HEIGHT / visibleHourSpan;
    return {
      style: {
        height: `${baseHeight}px`,
        minHeight: `${baseHeight}px`,
        flex: '0 0 auto',
      },
    };
  }, [visibleHourSpan]);

  const minTime = useMemo(() => new Date(1970, 0, 1, timeRange[0], 0, 0), [timeRange]);
  const maxTime = useMemo(() => {
    const hour = Math.min(24, Math.max(timeRange[1], timeRange[0] + 1));
    if (hour >= 24) {
      return new Date(1970, 0, 1, 23, 59, 59, 999);
    }
    return new Date(1970, 0, 1, hour, 0, 0);
  }, [timeRange]);
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
                { label: 'Referees', value: 'referees' },
                { label: 'Refunds', value: 'refunds' },
                { label: 'Fields', value: 'fields' },
              ]}
              mb="lg"
            />

            {activeTab === 'overview' && (
              <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="lg">
                <div style={{ gridColumn: 'span 2' }}>
                  <Paper withBorder p="md" radius="md" mb="md">
                    <Group justify="space-between" align="flex-start" mb="xs">
                      <Title order={5}>About</Title>
                      {isOwner && (
                        <Button variant="light" size="xs" onClick={() => setShowEditOrganizationModal(true)}>
                          Edit Organization
                        </Button>
                      )}
                    </Group>
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
                            onClick={() => { setSelectedEvent(e); setShowEventDetailSheet(true); }}
                          />
                        ))}
                      </SimpleGrid>
                    ) : (
                      <Text size="sm" c="dimmed">No events yet.</Text>
                    )}
                  </Paper>
                </div>
                <div>
                  <Paper withBorder p="md" radius="md" mb="md">
                    <Title order={5} mb="sm">Payments</Title>
                    <Text size="sm" c="dimmed" mb="sm">
                      {organizationHasStripeAccount
                        ? 'Stripe is connected. Manage your payout details when needed.'
                        : 'Connect a Stripe account to accept payments for rentals.'}
                    </Text>
                    {isOwner ? (
                      <Stack gap="xs">
                        {!organizationHasStripeAccount && (
                          <TextInput
                            label="Stripe payout email"
                            type="email"
                            placeholder="billing@example.com"
                            value={stripeEmail}
                            error={stripeEmailError ?? undefined}
                            onChange={(e) => {
                              const next = e.currentTarget.value;
                              setStripeEmail(next);
                              if (stripeEmailError && EMAIL_REGEX.test(next.trim())) {
                                setStripeEmailError(null);
                              }
                            }}
                            disabled={connectingStripe}
                            required
                          />
                        )}
                        <Button
                          size="sm"
                          loading={organizationHasStripeAccount ? managingStripe : connectingStripe}
                          disabled={!organizationHasStripeAccount && !stripeEmailValid}
                          onClick={organizationHasStripeAccount ? handleManageStripeAccount : handleConnectStripeAccount}
                        >
                          {organizationHasStripeAccount ? 'Manage Stripe Account' : 'Connect Stripe Account'}
                        </Button>
                        {!organizationHasStripeAccount && (
                          <Text size="xs" c="dimmed">
                            Completing onboarding enables paid rentals for this organization.
                          </Text>
                        )}
                      </Stack>
                    ) : (
                      <Text size="sm" c="dimmed">
                        Contact the organization owner to connect a Stripe account.
                      </Text>
                    )}
                  </Paper>
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
                  <Paper withBorder p="md" radius="md" mt="md">
                    <Title order={5} mb="md">Referees</Title>
                    {currentReferees.length > 0 ? (
                      <div className="space-y-3">
                        {currentReferees.slice(0, 4).map((ref) => (
                          <UserCard key={ref.$id} user={ref} className="!p-0 !shadow-none" />
                        ))}
                      </div>
                    ) : (
                      <Text size="sm" c="dimmed">No referees yet.</Text>
                    )}
                  </Paper>
                </div>
              </SimpleGrid>
            )}

            {activeTab === 'events' && (
              <Paper withBorder p="md" radius="md">
                <Group justify="space-between" mb="sm">
                  <Title order={5}>Events Calendar</Title>
                  <Button onClick={handleCreateEvent}>+ Create Event</Button>
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
                    views={["month", "week", "day", "agenda"]}
                    view={calendarView}
                    date={calendarDate}
                    onView={(view) => setCalendarView(view)}
                    onNavigate={(date) => setCalendarDate(new Date(date))}
                    step={30}
                    popup
                    selectable
                    components={{ event: CalendarEvent, month: { event: CalendarEvent } as any }}
                    onSelectEvent={(evt: any) => { setSelectedEvent(evt.resource); setShowEventDetailSheet(true); }}
                    onSelectSlot={handleCreateEvent}
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

            {activeTab === 'referees' && (
              <Paper withBorder p="md" radius="md">
                <Group justify="space-between" mb="md">
                  <Title order={5}>Referees</Title>
                  {isOwner && <Text size="sm" c="dimmed">Manage your referee roster</Text>}
                </Group>

                <Stack gap="md">
                  <div>
                    <Title order={6} mb="sm">Current Referees</Title>
                    {currentReferees.length > 0 ? (
                      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                        {currentReferees.map((ref) => (
                          <Paper key={ref.$id} withBorder p="sm" radius="md">
                            <Group justify="space-between" align="center" gap="sm">
                              <UserCard user={ref} className="!p-0 !shadow-none flex-1" />
                              {isOwner && (
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  color="red"
                                  onClick={() => handleRemoveReferee(ref.$id)}
                                >
                                  Remove
                                </Button>
                              )}
                            </Group>
                          </Paper>
                        ))}
                      </SimpleGrid>
                    ) : (
                      <Text size="sm" c="dimmed">No referees yet.</Text>
                    )}
                  </div>

                  {isOwner && (
                    <Paper withBorder p="md" radius="md">
                      <Title order={6} mb="xs">Add Referees</Title>
                      <TextInput
                        value={refereeSearch}
                        onChange={(e) => handleSearchReferees(e.currentTarget.value)}
                        placeholder="Search referees by name or username"
                        mb="xs"
                      />
                      {refereeError && (
                        <Text size="xs" c="red" mb="xs">
                          {refereeError}
                        </Text>
                      )}
                      {refereeSearchLoading ? (
                        <Text size="sm" c="dimmed">Searching referees...</Text>
                      ) : refereeSearch.length < 2 ? (
                        <Text size="sm" c="dimmed">Type at least 2 characters to search for referees.</Text>
                      ) : refereeResults.length > 0 ? (
                        <Stack gap="xs">
                          {refereeResults.map((result) => (
                            <Paper key={result.$id} withBorder p="sm" radius="md">
                              <Group justify="space-between" align="center" gap="sm">
                                <UserCard user={result} className="!p-0 !shadow-none flex-1" />
                                <Button size="xs" onClick={() => handleAddReferee(result)}>
                                  Add
                                </Button>
                              </Group>
                            </Paper>
                          ))}
                        </Stack>
                      ) : (
                        <Stack gap="xs">
                          <Text size="sm" c="dimmed">No referees found. Invite by email below.</Text>
                        </Stack>
                      )}
                      <div className="mt-6">
                        <Title order={6} mb="xs">Invite referees by email</Title>
                        <Text size="sm" c="dimmed" mb="xs">
                          Add referees to this organization and send them an email invite.
                        </Text>
                        <div className="space-y-3">
                          {refereeInvites.map((invite, index) => (
                            <Paper key={index} withBorder radius="md" p="sm">
                              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                                <TextInput
                                  label="First name"
                                  placeholder="First name"
                                  value={invite.firstName}
                                  onChange={(e) => {
                                    const next = [...refereeInvites];
                                    next[index] = { ...invite, firstName: e.currentTarget.value };
                                    setRefereeInvites(next);
                                  }}
                                />
                                <TextInput
                                  label="Last name"
                                  placeholder="Last name"
                                  value={invite.lastName}
                                  onChange={(e) => {
                                    const next = [...refereeInvites];
                                    next[index] = { ...invite, lastName: e.currentTarget.value };
                                    setRefereeInvites(next);
                                  }}
                                />
                                <TextInput
                                  label="Email"
                                  placeholder="name@example.com"
                                  value={invite.email}
                                  onChange={(e) => {
                                    const next = [...refereeInvites];
                                    next[index] = { ...invite, email: e.currentTarget.value };
                                    setRefereeInvites(next);
                                  }}
                                />
                              </SimpleGrid>
                              {refereeInvites.length > 1 && (
                                <Group justify="flex-end" mt="xs">
                                  <Button
                                    variant="subtle"
                                    color="red"
                                    size="xs"
                                    onClick={() => {
                                      setRefereeInvites((prev) => prev.filter((_, i) => i !== index));
                                    }}
                                  >
                                    Remove
                                  </Button>
                                </Group>
                              )}
                            </Paper>
                          ))}
                          <Group justify="space-between" align="center">
                            <Button
                              type="button"
                              variant="default"
                              size="lg"
                              radius="md"
                              style={{ width: 64, height: 64, fontSize: 28, padding: 0 }}
                              onClick={() =>
                                setRefereeInvites((prev) => [...prev, { firstName: '', lastName: '', email: '' }])
                              }
                            >
                              +
                            </Button>
                            <Button
                              onClick={handleInviteRefereeEmails}
                              loading={invitingReferees}
                              disabled={invitingReferees}
                            >
                              Add Referees
                            </Button>
                          </Group>
                          {refereeInviteError && (
                            <Text size="xs" c="red">
                              {refereeInviteError}
                            </Text>
                          )}
                        </div>
                      </div>
                    </Paper>
                  )}
                </Stack>
              </Paper>
            )}

            {activeTab === 'refunds' && org && (
              <RefundRequestsList organizationId={org.$id} />
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
                    <Button
                      onClick={() => {
                        setEditingField(null);
                        setShowFieldModal(true);
                      }}
                    >
                      Create Field
                    </Button>
                  </Group>
                </Group>
                {fieldViewMode === 'list' ? (
                  org.fields && org.fields.length > 0 ? (
                    <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
                      {org.fields.map((f) => (
                        <Paper
                          key={f.$id}
                          withBorder
                          p="md"
                          radius="md"
                          className="cursor-pointer"
                          onClick={() => {
                            setEditingField(f);
                            setShowFieldModal(true);
                          }}
                        >
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
                        <Group justify="space-between" align="center" mb="sm">
                          <Text size="sm" c="dimmed">
                            Viewing schedule for {activeField.name || (activeField.fieldNumber ? `Field ${activeField.fieldNumber}` : 'Selected field')}
                          </Text>
                          <Button
                            size="xs"
                            variant="light"
                            disabled={!canCreateRentalSlots}
                            onClick={() => {
                              if (!canCreateRentalSlots) {
                                notifications.show({
                                  color: 'yellow',
                                  message: 'Add a location to your organization before creating rental slots.',
                                });
                                return;
                              }
                              setEditingRentalSlot(null);
                              setShowRentalSlotModal(true);
                            }}
                          >
                            Add rental slot
                          </Button>
                        </Group>
                      )}

                      <div className="w-full">
                        {showTimeRangeSlider && (
                          <div className="mb-8">
                            <Text size="sm" fw={600} mb={8}>
                              Visible hours: {formatHourLabel(timeRange[0])} – {formatHourLabel(timeRange[1])}
                            </Text>
                            <RangeSlider
                              min={0}
                              max={24}
                              step={1}
                              minRange={1}
                              value={timeRange}
                              onChange={(value) => setTimeRange(value as [number, number])}
                              marks={[
                                { value: 0, label: '12 AM' },
                                { value: 6, label: '6 AM' },
                                { value: 12, label: '12 PM' },
                                { value: 18, label: '6 PM' },
                                { value: 24, label: '12 AM' },
                              ]}
                              label={(value) => formatHourLabel(value)}
                              size="sm"
                            />
                          </div>
                        )}
                        <BigCalendar
                          localizer={localizer}
                          events={filteredFieldScheduleEvents}
                          startAccessor="start"
                          endAccessor="end"
                          view={fieldCalendarView}
                          date={fieldCalendarDate}
                          onView={(v) => setFieldCalendarView(v)}
                          onNavigate={(date) => setFieldCalendarDate(new Date(date))}
                          views={["month", "week", "day", "agenda"]}
                          components={{ event: CalendarEvent, month: { event: CalendarEvent } as any }}
                          popup
                          selectable={false}
                          onSelectEvent={(evt: any) => {
                            if (evt.metaType === 'event' && evt.resource) {
                              setSelectedEvent(evt.resource);
                              setShowEventDetailSheet(true);
                            } else if (evt.metaType === 'rental' && evt.resource) {
                              setEditingRentalSlot(evt.resource as TimeSlot);
                              setShowRentalSlotModal(true);
                            }
                          }}
                          min={minTime}
                          max={maxTime}
                          slotGroupPropGetter={slotGroupPropGetter}
                          style={{ minHeight: MIN_FIELD_CALENDAR_HEIGHT }}
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
      <EventDetailSheet
        event={selectedEvent!}
        isOpen={showEventDetailSheet}
        onClose={() => { setShowEventDetailSheet(false); }}
      />
      <CreateTeamModal
        isOpen={showCreateTeamModal}
        onClose={() => setShowCreateTeamModal(false)}
        currentUser={user}
        onTeamCreated={async () => { setShowCreateTeamModal(false); if (id) await loadOrg(id); }}
      />
      <CreateFieldModal
        isOpen={showFieldModal}
        onClose={() => {
          setShowFieldModal(false);
          setEditingField(null);
        }}
        organization={org}
        field={editingField}
        onFieldSaved={handleFieldSaved}
      />
      <CreateRentalSlotModal
        opened={showRentalSlotModal}
        onClose={() => {
          setShowRentalSlotModal(false);
          setEditingRentalSlot(null);
        }}
        field={activeField}
        slot={editingRentalSlot}
        onSaved={handleRentalSlotSaved}
        organizationHasStripeAccount={organizationHasStripeAccount}
      />
      <CreateOrganizationModal
        isOpen={showEditOrganizationModal}
        onClose={() => setShowEditOrganizationModal(false)}
        currentUser={user!}
        organization={org}
        onUpdated={async (updatedOrg) => {
          setOrg(updatedOrg);
          if (id) {
            await loadOrg(id);
          }
        }}
      />
    </>
  );
}

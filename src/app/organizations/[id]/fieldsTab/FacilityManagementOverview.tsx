"use client";

import { Badge, Button, Collapse, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import ResponsiveCardGrid from '@/components/ui/ResponsiveCardGrid';
import type { Facility, Field } from '@/types';
import type { FacilityCalendarSummary } from '../fieldCalendar';

const FACILITY_METRIC_CARD_STYLE = {
  border: '1px solid var(--mantine-color-gray-3)',
  borderRadius: 8,
  padding: '12px',
  minHeight: 92,
} as const;

const formatMetricMoney = (cents: number): string => `$${(Math.max(0, Math.round(cents)) / 100).toFixed(2)}`;

const formatCourtHours = (hours: number): string => {
  const normalized = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  const rounded = Math.round(normalized * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)}h` : `${rounded.toFixed(1)}h`;
};

const formatCourtHourLabel = (hours: number): string => {
  const normalized = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  const rounded = Math.round(normalized * 10) / 10;
  const label = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
  return `${label} court-hour${rounded === 1 ? '' : 's'}`;
};

function FacilityMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div style={FACILITY_METRIC_CARD_STYLE}>
      <Stack gap={4}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          {label}
        </Text>
        <Text size="xl" fw={800}>
          {value}
        </Text>
        <Text size="xs" c="dimmed">
          {detail}
        </Text>
      </Stack>
    </div>
  );
}

type FacilityManagementOverviewProps = {
  facilities: Facility[];
  unassignedFields: Field[];
  resourceCountByFacilityId: Map<string, number>;
  facilityCalendarRangeLabel: string;
  facilityCalendarSummary: FacilityCalendarSummary;
  summaryOpen: boolean;
  onToggleSummary: () => void;
  onEditFacility: (facility: Facility) => void;
  onViewUnassignedResources: () => void;
  getOperatingHoursLabel: (facility: Facility) => string | null;
};

export default function FacilityManagementOverview({
  facilities,
  unassignedFields,
  resourceCountByFacilityId,
  facilityCalendarRangeLabel,
  facilityCalendarSummary,
  summaryOpen,
  onToggleSummary,
  onEditFacility,
  onViewUnassignedResources,
  getOperatingHoursLabel,
}: FacilityManagementOverviewProps) {
  return (
    <Stack gap="md">
      <Stack gap="sm">
        {facilities.length > 0 || unassignedFields.length > 0 ? (
          <ResponsiveCardGrid maxCardWidth={360} className="facility-management-grid">
            {facilities.map((facility) => {
              const operatingHoursLabel = getOperatingHoursLabel(facility);
              const resourceCount = resourceCountByFacilityId.get(facility.$id) ?? 0;
              return (
                <div
                  key={facility.$id}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2"
                >
                  <Group justify="space-between" gap="sm" align="flex-start">
                    <div className="min-w-0">
                      <Group gap="xs">
                        <Text fw={700} size="sm">{facility.name || 'Facility'}</Text>
                        {facility.isDefault ? <Badge size="xs" variant="light">Default</Badge> : null}
                      </Group>
                      {facility.location || facility.address ? (
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          {facility.location || facility.address}
                        </Text>
                      ) : null}
                      {operatingHoursLabel ? (
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          {operatingHoursLabel}
                        </Text>
                      ) : null}
                      <Text size="xs" c="dimmed">
                        {resourceCount} resource{resourceCount === 1 ? '' : 's'}
                      </Text>
                    </div>
                    <Button size="compact-xs" variant="subtle" onClick={() => onEditFacility(facility)}>
                      Edit
                    </Button>
                  </Group>
                </div>
              );
            })}
            {unassignedFields.length > 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-2">
                <Group justify="space-between" gap="sm" align="flex-start">
                  <div className="min-w-0">
                    <Group gap="xs">
                      <Text fw={700} size="sm">Unassigned resources</Text>
                      <Badge size="xs" variant="light" color="yellow">Needs facility</Badge>
                    </Group>
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      Resources without a facility grouping.
                    </Text>
                    <Text size="xs" c="dimmed">
                      {unassignedFields.length} resource{unassignedFields.length === 1 ? '' : 's'}
                    </Text>
                  </div>
                  <Button size="compact-xs" variant="subtle" onClick={onViewUnassignedResources}>
                    View
                  </Button>
                </Group>
              </div>
            ) : null}
          </ResponsiveCardGrid>
        ) : (
          <Text size="sm" c="dimmed">
            Create a facility before assigning resources.
          </Text>
        )}
      </Stack>

      <div className="rounded-md border border-slate-200 bg-white p-3">
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <div>
              <Text fw={700}>Facility operations summary</Text>
              <Text size="sm" c="dimmed">
                Hidden by default while the calendar and resource controls stay primary.
              </Text>
            </div>
            <Button size="xs" variant="default" onClick={onToggleSummary}>
              {summaryOpen ? 'Hide summary' : 'Show summary'}
            </Button>
          </Group>

          <Collapse in={summaryOpen}>
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start">
                <Text size="sm" c="dimmed">
                  {facilityCalendarRangeLabel} - {facilityCalendarSummary.fieldCount} selected resource{facilityCalendarSummary.fieldCount === 1 ? '' : 's'}
                </Text>
                <Badge
                  color={facilityCalendarSummary.conflictCount > 0 ? 'red' : 'teal'}
                  variant={facilityCalendarSummary.conflictCount > 0 ? 'filled' : 'light'}
                >
                  {facilityCalendarSummary.conflictCount > 0
                    ? `${facilityCalendarSummary.conflictCount} unresolved`
                    : 'No conflicts'}
                </Badge>
              </Group>

              <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
                <FacilityMetric
                  label="Utilization"
                  value={`${facilityCalendarSummary.utilizationPercent}%`}
                  detail={`${formatCourtHourLabel(facilityCalendarSummary.bookedInventoryHours)} booked of ${formatCourtHourLabel(facilityCalendarSummary.rentalInventoryHours)}`}
                />
                <FacilityMetric
                  label="Revenue / court-hour"
                  value={`${formatMetricMoney(facilityCalendarSummary.revenuePerCourtHourCents)}/hr`}
                  detail={`${formatMetricMoney(facilityCalendarSummary.potentialRevenueCents)} listed rental inventory`}
                />
                <FacilityMetric
                  label="Open inventory"
                  value={formatCourtHours(facilityCalendarSummary.openInventoryHours)}
                  detail={`${facilityCalendarSummary.rentalSlotCount} rental slot${facilityCalendarSummary.rentalSlotCount === 1 ? '' : 's'} in view`}
                />
                <FacilityMetric
                  label="Unresolved conflicts"
                  value={String(facilityCalendarSummary.conflictCount)}
                  detail={`${formatCourtHourLabel(facilityCalendarSummary.conflictHours)} overlapping bookings`}
                />
              </SimpleGrid>

              {facilityCalendarSummary.facilities.length > 1 ? (
                <div className="space-y-2">
                  {facilityCalendarSummary.facilities.map((facility) => (
                    <div key={facility.facilityId ?? facility.facilityName} className="rounded-md border border-slate-200 px-3 py-2">
                      <Group justify="space-between" gap="xs" align="center">
                        <Group gap="xs" align="center">
                          <Text fw={700} size="sm">{facility.facilityName}</Text>
                          <Badge size="sm" variant="light">
                            {facility.fieldCount} resource{facility.fieldCount === 1 ? '' : 's'}
                          </Badge>
                        </Group>
                        <Group gap="md">
                          <Text size="xs" c="dimmed">{facility.utilizationPercent}% used</Text>
                          <Text size="xs" c="dimmed">{formatCourtHours(facility.openInventoryHours)} open</Text>
                          <Text size="xs" c={facility.conflictCount > 0 ? 'red' : 'dimmed'}>
                            {facility.conflictCount} conflict{facility.conflictCount === 1 ? '' : 's'}
                          </Text>
                        </Group>
                      </Group>
                    </div>
                  ))}
                </div>
              ) : null}
            </Stack>
          </Collapse>
        </Stack>
      </div>
    </Stack>
  );
}

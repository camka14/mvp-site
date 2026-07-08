'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Button, Group, Select, TextInput } from '@mantine/core';
import type { Facility, Field, Organization } from '@/types';
import { fieldService } from '@/lib/fieldService';
import { sportsService } from '@/lib/sportsService';
import LocationSelector, { type LocationSelectionMeta } from '@/components/location/LocationSelector';
import ResourceSportsInput, { type ResourceSportOption } from '@/components/ui/ResourceSportsInput';

interface CreateFieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  organization?: Organization;
  field?: Field | null;
  facilities?: Facility[];
  defaultFacilityId?: string | null;
  onFieldSaved?: (field: Field) => void;
}

type FieldFormState = {
  $id?: string;
  name: string;
  location: string;
  lat: string | number;
  long: string | number;
  facilityId: string | null;
  sportIds: string[];
  organization?: Organization;
};

const createEmptyState = (organization?: Organization, defaultFacilityId?: string | null): FieldFormState => ({
  $id: undefined,
  name: '',
  location: '',
  lat: '',
  long: '',
  facilityId: defaultFacilityId ?? null,
  sportIds: [],
  organization: organization
});

const hasSelectedCoordinates = (lat: unknown, lng: unknown): boolean => {
  const normalizedLat = Number(lat);
  const normalizedLng = Number(lng);
  return Number.isFinite(normalizedLat) && Number.isFinite(normalizedLng) && !(normalizedLat === 0 && normalizedLng === 0);
};

export default function CreateFieldModal(props: CreateFieldModalProps) {
  const {
    isOpen,
    onClose,
    organization,
    field,
    facilities = [],
    defaultFacilityId = null,
    onFieldSaved,
  } = props;
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FieldFormState>(() => createEmptyState(organization, defaultFacilityId));
  const [locationSelected, setLocationSelected] = useState(false);
  const [sportsLoading, setSportsLoading] = useState(false);
  const [sportsError, setSportsError] = useState<string | null>(null);
  const [sportOptions, setSportOptions] = useState<ResourceSportOption[]>([]);

  const isEditMode = useMemo(() => Boolean(field?.$id), [field]);
  const facilityOptions = useMemo(
    () => facilities
      .filter((facility) => facility?.$id)
      .map((facility) => ({
        value: facility.$id,
        label: facility.name || 'Facility',
      })),
    [facilities],
  );
  const requiresFacility = Boolean(organization?.$id && facilityOptions.length > 0);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    setSportsLoading(true);
    setSportsError(null);
    sportsService.getAll()
      .then((sports) => {
        if (cancelled) {
          return;
        }
        setSportOptions(
          sports
            .filter((sport) => sport.$id || sport.name)
            .map((sport) => ({
              value: sport.$id || sport.name,
              label: sport.name || sport.$id,
            })),
        );
      })
      .catch((error) => {
        console.error('Failed to load sports for resource form:', error);
        if (!cancelled) {
          setSportsError('Sports could not be loaded. You can save the resource and add sports later.');
          setSportOptions([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSportsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (field) {
      setForm({
        $id: field.$id,
        name: field.name || '',
        location: field.location || '',
        lat: typeof field.lat === 'number' ? field.lat : '',
        long: typeof field.long === 'number' ? field.long : '',
        facilityId: field.facilityId ?? defaultFacilityId ?? null,
        sportIds: Array.isArray(field.sportIds) ? field.sportIds : [],
        organization: field.organization
      });
      setLocationSelected(Boolean((field.location || '').trim()) && hasSelectedCoordinates(field.lat, field.long));
    } else {
      setForm(createEmptyState(organization, defaultFacilityId));
      setLocationSelected(false);
    }
  }, [isOpen, field, organization, defaultFacilityId]);

  const hasResourceLocation = form.location.trim().length > 0;
  const isLocationValid = !hasResourceLocation || locationSelected;
  const isValid = form.name.trim().length > 0 && (!requiresFacility || Boolean(form.facilityId)) && isLocationValid;
  const mergedSportOptions = useMemo(() => {
    const optionsByValue = new Map(sportOptions.map((option) => [option.value, option]));
    form.sportIds.forEach((sportId) => {
      if (!optionsByValue.has(sportId)) {
        optionsByValue.set(sportId, { value: sportId, label: sportId });
      }
    });
    return Array.from(optionsByValue.values());
  }, [form.sportIds, sportOptions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      const normalizedLocation = form.location.trim();
      const payload = {
        $id: form.$id,
        name: form.name.trim(),
        location: normalizedLocation || null,
        lat: form.lat === '' ? undefined : Number(form.lat),
        long: form.long === '' ? undefined : Number(form.long),
        facilityId: form.facilityId,
        sportIds: form.sportIds,
        organization: form.organization || undefined,
      };
      const saved = isEditMode && payload.$id
        ? await fieldService.updateField({
            $id: payload.$id,
            name: payload.name,
            location: payload.location,
            lat: payload.lat,
            long: payload.long,
            facilityId: payload.facilityId,
            sportIds: payload.sportIds,
          })
        : await fieldService.createField(payload);
      onFieldSaved?.(saved);
      onClose();
      setForm(createEmptyState(organization, defaultFacilityId));
      setLocationSelected(false);
    } catch (err) {
      console.error('Failed to save resource:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal opened={isOpen} onClose={onClose} title={isEditMode ? 'Update Resource' : 'Create Resource'} size="md" centered>
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextInput
          label="Name"
          placeholder="Court 1, Pitch A, Turf 2, etc."
          value={form.name}
          onChange={(e) => {
            const value = e.currentTarget.value;
            setForm(prev => ({ ...prev, name: value }));
          }}
          required
        />

        {facilityOptions.length > 0 ? (
          <Select
            label="Facility"
            data={facilityOptions}
            value={form.facilityId}
            onChange={(value) => setForm((prev) => ({ ...prev, facilityId: value }))}
            placeholder="Choose a facility"
            required={requiresFacility}
            searchable
          />
        ) : null}

        <ResourceSportsInput
          value={form.sportIds}
          options={mergedSportOptions}
          loading={sportsLoading}
          disabled={sportsLoading && mergedSportOptions.length === 0}
          onChange={(values) => setForm((prev) => ({ ...prev, sportIds: values }))}
        />

        {sportsError ? (
          <Alert color="yellow" radius="md">
            {sportsError}
          </Alert>
        ) : null}

        <LocationSelector
          value={form.location}
          coordinates={{
            lat: form.lat ? Number(form.lat) : 0,
            lng: form.long ? Number(form.long) : 0,
          }}
          label="Location (optional, defaults to Facility location)"
          onChange={(location, lat, lng, _address, meta?: LocationSelectionMeta) => {
            const nextSelected = Boolean(meta?.selected);
            setLocationSelected(nextSelected);
            setForm(prev => ({
              ...prev,
              location,
              lat: nextSelected ? lat : '',
              long: nextSelected ? lng : '',
            }));
          }}
          isValid={isLocationValid}
          errorMessage="Select a resource address from suggestions or the map, or leave it blank to use the facility location."
          requireSelection
          selected={locationSelected}
          selectionErrorMessage="Select a resource address from suggestions or the map, or leave it blank to use the facility location."
        />

        <Group justify="space-between" pt="sm">
          <Button variant="default" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" disabled={!isValid || submitting}>
            {submitting ? (isEditMode ? 'Saving…' : 'Creating…') : (isEditMode ? 'Update Resource' : 'Create Resource')}
          </Button>
        </Group>
      </form>
    </Modal>
  );
}

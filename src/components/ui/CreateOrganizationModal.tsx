"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Button, Group, TextInput, Textarea, Alert, MultiSelect, Text } from '@mantine/core';
import type { Organization, UserData } from '@/types';
import { organizationService } from '@/lib/organizationService';
import { ImageUploader } from './ImageUploader';
import { notifications } from '@mantine/notifications';
import LocationSelector from '@/components/location/LocationSelector';
import { useLocation } from '@/app/hooks/useLocation';
import type { LocationInfo } from '@/lib/locationService';
import { useSports } from '@/app/hooks/useSports';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserData;
  organization?: Organization | null;
  onCreated?: (org: Organization) => void;
  onUpdated?: (org: Organization) => void;
}

const DEFAULT_COORDINATES = { lat: 37.7749, lng: -122.4194 };
const DEFAULT_LOCATION_LABEL = 'San Francisco, CA';

const formatLocationLabel = (info: LocationInfo | null | undefined, coords: { lat: number; lng: number }) => {
  if (info) {
    const parts = [info.city, info.state].filter((part): part is string => Boolean(part && part.trim().length > 0));
    if (parts.length) {
      return parts.join(', ');
    }
    if (info.zipCode && info.zipCode.trim().length > 0) {
      return info.zipCode;
    }
  }
  return `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
};

const isSameCoordinates = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6;

export default function CreateOrganizationModal({
  isOpen,
  onClose,
  currentUser,
  organization,
  onCreated,
  onUpdated,
}: Props) {
  const isEditing = Boolean(organization);
  const { location: userLocation, locationInfo } = useLocation();
  const { sports, loading: sportsLoading, error: sportsError } = useSports();
  const initializedRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    website: '',
    sports: [] as string[],
    location: '',
    logoId: '',
  });

  const sportOptions = useMemo(() => {
    const names = new Set<string>();
    sports.forEach((sport) => {
      const normalized = typeof sport.name === 'string' ? sport.name.trim() : '';
      if (normalized) {
        names.add(normalized);
      }
    });
    form.sports.forEach((sport) => {
      const normalized = typeof sport === 'string' ? sport.trim() : '';
      if (normalized) {
        names.add(normalized);
      }
    });
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
  }, [sports, form.sports]);
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const coordinatesPresent = coordinates !== null && (coordinates.lat !== 0 || coordinates.lng !== 0);

  const initialCoordinates = useMemo(() => {
    if (!organization?.coordinates || organization.coordinates.length < 2) {
      return null;
    }
    const [lng, lat] = organization.coordinates;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    return { lat: Number(lat), lng: Number(lng) };
  }, [organization?.coordinates]);

  useEffect(() => {
    if (!isOpen) {
      initializedRef.current = false;
      return;
    }

    setError(null);

    if (isEditing && organization) {
      const editingCoords = initialCoordinates ?? userLocation ?? DEFAULT_COORDINATES;
      const editingLabel =
        organization.location && organization.location.trim().length > 0
          ? organization.location
          : formatLocationLabel(
              initialCoordinates ? null : locationInfo,
              editingCoords,
            );
      setForm({
        name: organization.name ?? '',
        description: organization.description ?? '',
        website: organization.website ?? '',
        sports: Array.isArray(organization.sports)
          ? organization.sports
            .filter((sport): sport is string => typeof sport === 'string')
            .map((sport) => sport.trim())
            .filter((sport) => sport.length > 0)
          : [],
        location: editingLabel,
        logoId: organization.logoId ?? '',
      });
      setCoordinates(editingCoords);

      if (organization.logoId) {
        try {
          setLogoUrl(`/api/files/${organization.logoId}/preview?w=160&h=160&fit=cover`);
        } catch (previewError) {
          console.warn('Unable to load organization logo preview:', previewError);
          setLogoUrl('');
        }
      } else {
        setLogoUrl('');
      }
      initializedRef.current = true;
      return;
    }

    if (initializedRef.current) {
      return;
    }

    const baseCoords = userLocation ?? DEFAULT_COORDINATES;
    const label = userLocation ? formatLocationLabel(locationInfo, baseCoords) : DEFAULT_LOCATION_LABEL;

    setForm({
      name: '',
      description: '',
      website: '',
      sports: [],
      location: label,
      logoId: '',
    });
    setCoordinates(baseCoords);
    setLogoUrl('');
    initializedRef.current = true;
  }, [isOpen, isEditing, organization, initialCoordinates, userLocation, locationInfo]);

  useEffect(() => {
    if (!isOpen || isEditing || !userLocation) {
      return;
    }

    if (coordinates && isSameCoordinates(coordinates, userLocation)) {
      return;
    }

    if (!coordinates || isSameCoordinates(coordinates, DEFAULT_COORDINATES)) {
      const label = formatLocationLabel(locationInfo, userLocation);
      setCoordinates(userLocation);
      setForm((prev) => ({ ...prev, location: label }));
    }
  }, [isOpen, isEditing, userLocation, locationInfo, coordinates]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const hasValidCoordinates = coordinatesPresent;

    if (!form.location.trim() || !hasValidCoordinates) {
      setError('Select a location on the map.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const trimmedName = form.name.trim();
      const trimmedDescription = form.description.trim();
      const trimmedWebsite = form.website.trim();
      const trimmedLocation = form.location.trim();
      const selectedSports = Array.from(
        new Set(
          form.sports
            .filter((sport): sport is string => typeof sport === 'string')
            .map((sport) => sport.trim())
            .filter((sport) => sport.length > 0),
        ),
      );
      const coordinatesPayload = hasValidCoordinates && coordinates
        ? ([Number(coordinates.lng), Number(coordinates.lat)] as [number, number])
        : undefined;

      if (isEditing && organization) {
        const updatePayload: Partial<Organization> = {
          name: trimmedName,
          description: trimmedDescription || undefined,
          website: trimmedWebsite || undefined,
          sports: selectedSports,
          location: trimmedLocation || undefined,
          logoId: form.logoId || undefined,
        };

        if (coordinatesPayload) {
          updatePayload.coordinates = coordinatesPayload;
        }

        const updated = await organizationService.updateOrganization(organization.$id, updatePayload);
        onUpdated?.(updated);
        notifications.show({ color: 'teal', message: 'Organization updated successfully.' });
      } else {
        const created = await organizationService.createOrganization({
          name: trimmedName,
          description: trimmedDescription || undefined,
          website: trimmedWebsite || undefined,
          sports: selectedSports,
          location: trimmedLocation || undefined,
          coordinates: coordinatesPayload,
          logoId: form.logoId || undefined,
          ownerId: currentUser.$id,
          hasStripeAccount: false,
        });
        onCreated?.(created);
        notifications.show({ color: 'teal', message: 'Organization created successfully.' });
        setForm({
          name: '',
          description: '',
          website: '',
          sports: [],
          location: '',
          logoId: '',
        });
        setLogoUrl('');
        setCoordinates(null);
      }
      onClose();
    } catch (e) {
      console.error(isEditing ? 'Failed to update organization' : 'Failed to create organization', e);
      notifications.show({
        color: 'red',
        message: isEditing ? 'Unable to update organization.' : 'Unable to create organization.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const modalTitle = isEditing ? 'Edit Organization' : 'Create Organization';
  const submitLabel = submitting ? (isEditing ? 'Saving…' : 'Creating…') : isEditing ? 'Save Changes' : 'Create Organization';

  const handleFieldChange = (field: 'name' | 'description' | 'website' | 'location' | 'logoId') =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.currentTarget?.value ?? '';
      setForm((prev) => ({ ...prev, [field]: value }));
    };

  return (
    <Modal opened={isOpen} onClose={onClose} title={modalTitle} size="md" centered>
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextInput
          label="Name"
          value={form.name}
          onChange={handleFieldChange('name')}
          placeholder="Organization name"
          required
          maxLength={80}
        />
        <Textarea
          label="Description"
          value={form.description}
          onChange={handleFieldChange('description')}
          placeholder="Tell people what your organization does"
          autosize minRows={3}
          maxLength={500}
        />
        <TextInput
          label="Website"
          value={form.website}
          onChange={handleFieldChange('website')}
          placeholder="https://example.com"
          type="url"
        />
        <div>
          <MultiSelect
            label="Sports covered"
            value={form.sports}
            onChange={(value) => setForm((prev) => ({ ...prev, sports: value }))}
            data={sportOptions}
            searchable
            clearable
            placeholder={sportsLoading ? 'Loading sports...' : 'Select sports'}
            nothingFoundMessage={sportsLoading ? 'Loading sports...' : 'No sports found'}
            maxDropdownHeight={220}
          />
          {sportsError && (
            <Text size="xs" c="red" mt={4}>
              Failed to load sports list. You can still save existing selections.
            </Text>
          )}
        </div>
        <LocationSelector
          value={form.location}
          coordinates={{
            lat: coordinates?.lat ?? DEFAULT_COORDINATES.lat,
            lng: coordinates?.lng ?? DEFAULT_COORDINATES.lng,
          }}
          onChange={(location, lat, lng) => {
            setForm((prev) => ({ ...prev, location }));
            setCoordinates({ lat, lng });
          }}
          isValid={Boolean(form.location.trim()) && coordinatesPresent}
        />
        {error && (
          <Alert color="red" radius="md">
            {error}
          </Alert>
        )}
        <div>
          <label className="form-label">Logo</label>
          <ImageUploader
            currentImageUrl={logoUrl}
            className="w-full"
            placeholder="Upload or select a logo"
            onChange={(fileId, url) => {
              setLogoUrl(url);
              setForm((p) => ({ ...p, logoId: fileId ? fileId : '' }));
            }}
          />
        </div>
        <Group justify="space-between" pt="sm">
          <Button variant="default" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" disabled={submitting || !form.name.trim()}>
            {submitLabel}
          </Button>
        </Group>
      </form>
    </Modal>
  );
}

"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import type { Organization, OrganizationFeature, OrganizationTag, UserData } from '@/types';
import {
  organizationService,
  type OrganizationMatch,
  type OrganizationMatchResult,
} from '@/lib/organizationService';
import { ImageUploader } from './ImageUploader';
import { OrganizationTagsInput } from './OrganizationTagsInput';
import { notifications } from '@mantine/notifications';
import LocationSelector from '@/components/location/LocationSelector';
import { useLocation } from '@/app/hooks/useLocation';
import type { LocationInfo } from '@/lib/locationService';
import { useSports } from '@/app/hooks/useSports';
import {
  DEFAULT_ORGANIZATION_STATUS,
  getOrganizationStatus,
  type OrganizationStatus,
} from '@/lib/organizationStatus';
import type { OrganizationDefaultEventTaxHandling, OrganizationTaxClassification } from '@/lib/taxPolicy';
import {
  normalizeOrganizationDefaultEventTaxHandling,
  normalizeOrganizationTaxClassification,
} from '@/lib/taxPolicy';
import { normalizeOrganizationFeatures, ORGANIZATION_FEATURE_OPTIONS } from '@/lib/organizationFeatures';
import { isApiRequestError } from '@/lib/apiClient';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserData;
  organization?: Organization | null;
  onCreated?: (org: Organization) => void;
  onUpdated?: (org: Organization) => void;
  initialFeatures?: OrganizationFeature[];
  initialTagSlugs?: string[];
}

const DEFAULT_COORDINATES = { lat: 37.7749, lng: -122.4194 };
const DEFAULT_LOCATION_LABEL = 'San Francisco, CA';
const ORGANIZATION_STATUS_OPTIONS: Array<{ value: OrganizationStatus; label: string }> = [
  { value: 'LISTED', label: 'Listed' },
  { value: 'UNLISTED', label: 'Unlisted' },
];

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

const ownershipBadgeLabel = (match: OrganizationMatch): string => {
  if (match.ownershipStatus === 'UNCLAIMED') return 'Unclaimed profile';
  if (match.ownershipStatus === 'CLAIMED') {
    return match.claimVerificationLevel === 'SITE_CONTROL'
      ? 'Claimed · website verified'
      : 'Claimed profile';
  }
  if (match.ownershipStatus === 'DISPUTED') return 'Ownership under review';
  if (match.ownershipStatus === 'SUSPENDED') return 'Ownership restricted';
  return 'Ownership review required';
};

const matchExplanation = (match: OrganizationMatch): string => {
  if (match.reasonCodes.includes('EXACT_OFFICIAL_URL')) {
    return 'The official website matches this profile.';
  }
  if (match.reasonCodes.includes('VERIFIED_DOMAIN_CONFLICT')) {
    return 'This website domain is already verified for this profile.';
  }
  if (match.reasonCodes.includes('REGISTRABLE_DOMAIN_MATCH')) {
    return 'The website domain matches this profile.';
  }
  if (match.reasonCodes.includes('LOCATION_MATCH')) {
    return 'The name and location look similar.';
  }
  return 'The organization name looks similar.';
};

export default function CreateOrganizationModal({
  isOpen,
  onClose,
  currentUser,
  organization,
  onCreated,
  onUpdated,
  initialFeatures,
  initialTagSlugs,
}: Props) {
  const isEditing = Boolean(organization);
  const { location: userLocation, locationInfo } = useLocation();
  const { sports, loading: sportsLoading, error: sportsError } = useSports();
  const initializedRef = useRef(false);
  const initializedOrganizationIdRef = useRef<string | null>(null);
  const initialTagsAppliedRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [createStep, setCreateStep] = useState<'match' | 'details'>('match');
  const [matchResult, setMatchResult] = useState<OrganizationMatchResult | null>(null);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [differentOrganizationConfirmed, setDifferentOrganizationConfirmed] = useState(false);
  const [tagOptions, setTagOptions] = useState<OrganizationTag[]>([]);
  const [tagOptionsError, setTagOptionsError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    website: '',
    sports: [] as string[],
    enabledFeatures: ['EVENT_MANAGEMENT'] as OrganizationFeature[],
    location: '',
    address: '',
    logoId: '',
    status: DEFAULT_ORGANIZATION_STATUS,
    taxOrganizationType: 'INDIVIDUAL_OR_CLUB' as OrganizationTaxClassification,
    operatesAthleticFacility: false,
    defaultEventTaxHandling: 'STRIPE_TAX' as OrganizationDefaultEventTaxHandling,
    taxResponsibilityAgreementAccepted: false,
    tags: [] as OrganizationTag[],
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
      initializedOrganizationIdRef.current = null;
      setCreateStep('match');
      setMatchResult(null);
      setMatching(false);
      setMatchError(null);
      setDifferentOrganizationConfirmed(false);
      return;
    }

    setError(null);

    if (isEditing && organization) {
      if (initializedRef.current && initializedOrganizationIdRef.current === organization.$id) {
        return;
      }
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
        enabledFeatures: normalizeOrganizationFeatures(organization.enabledFeatures),
        location: editingLabel,
        address: organization.address ?? '',
        logoId: organization.logoId ?? '',
        status: getOrganizationStatus(organization.status),
        taxOrganizationType: normalizeOrganizationTaxClassification(organization.taxOrganizationType),
        operatesAthleticFacility: Boolean(organization.operatesAthleticFacility),
        defaultEventTaxHandling: normalizeOrganizationDefaultEventTaxHandling(organization.defaultEventTaxHandling),
        taxResponsibilityAgreementAccepted: Boolean(organization.taxResponsibilityAcceptedAt),
        tags: Array.isArray(organization.tags) ? organization.tags : [],
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
      initializedOrganizationIdRef.current = organization.$id;
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
      enabledFeatures: normalizeOrganizationFeatures(initialFeatures),
      location: label,
      address: '',
      logoId: '',
      status: DEFAULT_ORGANIZATION_STATUS,
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'STRIPE_TAX',
      taxResponsibilityAgreementAccepted: false,
      tags: [],
    });
    setCoordinates(baseCoords);
    setLogoUrl('');
    setCreateStep('match');
    setMatchResult(null);
    setMatchError(null);
    setDifferentOrganizationConfirmed(false);
    initializedRef.current = true;
    initializedOrganizationIdRef.current = null;
  }, [isOpen, isEditing, organization, initialCoordinates, userLocation, locationInfo, initialFeatures]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const controller = new AbortController();
    setTagOptionsError(null);
    fetch('/api/organization-tags', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Failed to load organization tags')))
      .then((body) => {
        const tags = Array.isArray(body?.tags) ? body.tags : [];
        setTagOptions(tags);
      })
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') {
          setTagOptionsError('Unable to load organization tags.');
        }
      });

    return () => controller.abort();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      initialTagsAppliedRef.current = false;
      return;
    }
    if (isEditing || initialTagsAppliedRef.current || !initialTagSlugs?.length || !tagOptions.length) {
      return;
    }
    const requested = new Set(initialTagSlugs.map((slug) => slug.trim().toLowerCase()).filter(Boolean));
    const matchingTags = tagOptions.filter((tag) => requested.has((tag.slug ?? tag.name).trim().toLowerCase()));
    if (matchingTags.length) {
      setForm((previous) => ({
        ...previous,
        tags: Array.from(new Map(
          [...previous.tags, ...matchingTags].map((tag) => [tag.slug ?? tag.$id ?? tag.name, tag]),
        ).values()),
      }));
    }
    initialTagsAppliedRef.current = true;
  }, [initialTagSlugs, isEditing, isOpen, tagOptions]);

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

  useEffect(() => {
    if (!isOpen || isEditing || createStep !== 'match') {
      return;
    }
    const trimmedName = form.name.trim();
    const trimmedWebsite = form.website.trim();
    const trimmedLocation = form.location.trim();
    const shouldMatch = trimmedWebsite.length >= 4
      || (trimmedName.length >= 3 && trimmedLocation.length >= 2);
    if (!shouldMatch) {
      setMatchResult(null);
      setMatchError(null);
      setMatching(false);
      setDifferentOrganizationConfirmed(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setMatching(true);
      setMatchError(null);
      setDifferentOrganizationConfirmed(false);
      organizationService.findOrganizationMatches({
        name: trimmedName,
        website: trimmedWebsite || undefined,
        location: trimmedLocation || undefined,
        coordinates,
      }, { signal: controller.signal })
        .then((result) => {
          setMatchResult(result);
        })
        .catch((matchRequestError) => {
          if ((matchRequestError as { name?: string })?.name === 'AbortError') {
            return;
          }
          setMatchResult(null);
          setMatchError(matchRequestError instanceof Error
            ? matchRequestError.message
            : 'Unable to search for existing organizations.');
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setMatching(false);
          }
        });
    }, 450);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    coordinates,
    createStep,
    form.location,
    form.name,
    form.website,
    isEditing,
    isOpen,
  ]);

  const requestCurrentMatches = async (acknowledgedMatchIds: string[] = []) => {
    const result = await organizationService.findOrganizationMatches({
      name: form.name.trim(),
      website: form.website.trim() || undefined,
      location: form.location.trim() || undefined,
      coordinates,
      acknowledgedMatchIds,
    });
    setMatchResult(result);
    return result;
  };

  const handleContinueFromMatch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setMatchError('Enter the organization name.');
      return;
    }
    if (!form.location.trim() || !coordinatesPresent) {
      setMatchError('Select a location on the map.');
      return;
    }

    setMatching(true);
    setMatchError(null);
    try {
      const currentResult = matchResult ?? await requestCurrentMatches();
      const blockingMatches = currentResult.matches.filter((match) => match.blocksCreation);
      if (blockingMatches.length > 0) {
        setMatchError('Use the existing profile instead of creating a duplicate.');
        return;
      }

      const softMatchIds = currentResult.matches.map((match) => match.organizationId);
      if (softMatchIds.length > 0 && !differentOrganizationConfirmed) {
        setMatchError('Confirm that this is a different organization before continuing.');
        return;
      }

      const acknowledgedResult = softMatchIds.length > 0
        ? await requestCurrentMatches(softMatchIds)
        : currentResult;
      if (!acknowledgedResult.canContinue) {
        setMatchError('Review the latest organization matches before continuing.');
        return;
      }
      setCreateStep('details');
    } catch (matchRequestError) {
      setMatchError(matchRequestError instanceof Error
        ? matchRequestError.message
        : 'Unable to search for existing organizations.');
    } finally {
      setMatching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (!isEditing && (!matchResult?.matchToken || !matchResult.canContinue)) {
      setCreateStep('match');
      setMatchError('Search for existing organizations again before continuing.');
      return;
    }
    const hasValidCoordinates = coordinatesPresent;

    if (!form.location.trim() || !hasValidCoordinates) {
      setError('Select a location on the map.');
      return;
    }
    if (!form.taxResponsibilityAgreementAccepted) {
      setError('Accept the organization tax responsibility agreement before saving.');
      return;
    }
    if (form.enabledFeatures.length === 0) {
      setError('Select at least one organization tool.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const trimmedName = form.name.trim();
      const trimmedDescription = form.description.trim();
      const trimmedWebsite = form.website.trim();
      const trimmedLocation = form.location.trim();
      const trimmedAddress = form.address.trim();
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
          enabledFeatures: form.enabledFeatures,
          location: trimmedLocation || undefined,
          address: trimmedAddress || undefined,
          logoId: form.logoId || undefined,
          status: form.status,
          taxOrganizationType: form.taxOrganizationType,
          operatesAthleticFacility: form.operatesAthleticFacility,
          defaultEventTaxHandling: form.defaultEventTaxHandling,
          defaultRentalTaxHandling: 'STRIPE_TAX',
          taxResponsibilityAgreementAccepted: form.taxResponsibilityAgreementAccepted,
          tags: form.tags,
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
          enabledFeatures: form.enabledFeatures,
          location: trimmedLocation || undefined,
          address: trimmedAddress || undefined,
          coordinates: coordinatesPayload,
          logoId: form.logoId || undefined,
          ownerId: currentUser.$id,
          status: form.status,
          taxOrganizationType: form.taxOrganizationType,
          operatesAthleticFacility: form.operatesAthleticFacility,
          defaultEventTaxHandling: form.defaultEventTaxHandling,
          defaultRentalTaxHandling: 'STRIPE_TAX',
          taxResponsibilityAgreementAccepted: form.taxResponsibilityAgreementAccepted,
          tags: form.tags,
          organizationMatchToken: matchResult!.matchToken,
          acknowledgedMatchIds: matchResult!.acknowledgedMatchIds,
        });
        onCreated?.(created);
        notifications.show({ color: 'teal', message: 'Organization created successfully.' });
        setForm({
          name: '',
          description: '',
          website: '',
          sports: [],
          enabledFeatures: ['EVENT_MANAGEMENT'],
          location: '',
          address: '',
          logoId: '',
          status: DEFAULT_ORGANIZATION_STATUS,
          taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
          operatesAthleticFacility: false,
          defaultEventTaxHandling: 'STRIPE_TAX',
          taxResponsibilityAgreementAccepted: false,
          tags: [],
        });
        setLogoUrl('');
        setCoordinates(null);
      }
      onClose();
    } catch (e) {
      console.error(isEditing ? 'Failed to update organization' : 'Failed to create organization', e);
      if (!isEditing && isApiRequestError(e) && e.status === 409) {
        const payload = e.data && typeof e.data === 'object'
          ? e.data as { matches?: OrganizationMatch[]; code?: string; error?: string }
          : null;
        setCreateStep('match');
        setDifferentOrganizationConfirmed(false);
        if (payload?.matches) {
          setMatchResult((previous) => ({
            matches: payload.matches ?? [],
            matchToken: '',
            expiresInSeconds: previous?.expiresInSeconds ?? 0,
            acknowledgedMatchIds: [],
            canContinue: false,
          }));
        }
        setMatchError(payload?.error ?? 'Review the latest organization matches before continuing.');
        return;
      }
      setError(e instanceof Error ? e.message : 'Unable to save organization.');
      notifications.show({
        color: 'red',
        message: isEditing ? 'Unable to update organization.' : 'Unable to create organization.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const modalTitle = isEditing
    ? 'Edit Organization'
    : createStep === 'match'
      ? 'Find or create your organization'
      : 'Create organization';
  const submitLabel = submitting ? (isEditing ? 'Saving…' : 'Creating…') : isEditing ? 'Save Changes' : 'Create Organization';

  const handleFieldChange = (field: 'name' | 'description' | 'website' | 'location' | 'logoId') =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.currentTarget?.value ?? '';
      setForm((prev) => ({ ...prev, [field]: value }));
    };

  const handleCheckboxChange = (
    field: 'operatesAthleticFacility' | 'taxResponsibilityAgreementAccepted',
  ) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const { checked } = event.currentTarget;
      setForm((prev) => ({ ...prev, [field]: checked }));
    };

  const renderMatchActions = (match: OrganizationMatch) => {
    if (match.ownershipStatus === 'UNCLAIMED') {
      return (
        <Group gap="xs">
          <Button component="a" href={match.claimUrl} size="xs">
            Claim this profile
          </Button>
          <Button component="a" href={match.profileUrl} variant="default" size="xs">
            Open profile
          </Button>
        </Group>
      );
    }
    if (match.ownershipStatus === 'CLAIMED') {
      return (
        <Group gap="xs">
          <Button component="a" href={match.profileUrl} size="xs">
            Open profile
          </Button>
          <Button
            component="a"
            href={`${match.claimUrl}?requestType=OWNERSHIP_TRANSFER`}
            variant="default"
            size="xs"
          >
            Request ownership transfer
          </Button>
          <Button
            component="a"
            href={`${match.claimUrl}?requestType=OWNERSHIP_DISPUTE`}
            variant="subtle"
            size="xs"
          >
            Report an ownership issue
          </Button>
        </Group>
      );
    }
    return (
      <Group gap="xs">
        <Button component="a" href={match.profileUrl} variant="default" size="xs">
          Open profile
        </Button>
        <Button
          component="a"
          href={`${match.claimUrl}?requestType=OWNERSHIP_DISPUTE`}
          variant="subtle"
          size="xs"
        >
          Report an ownership issue
        </Button>
      </Group>
    );
  };

  return (
    <Modal opened={isOpen} onClose={onClose} title={modalTitle} size="lg" centered>
      <form
        onSubmit={!isEditing && createStep === 'match' ? handleContinueFromMatch : handleSubmit}
        className="space-y-4"
      >
        {!isEditing && createStep === 'match' ? (
          <>
            <Text size="sm" c="dimmed">
              Start with the organization&apos;s identity. We&apos;ll check for an existing profile before creating a new one.
            </Text>
            <TextInput
              label="Organization name"
              value={form.name}
              onChange={handleFieldChange('name')}
              placeholder="Organization name"
              required
              maxLength={80}
            />
            <TextInput
              label="Official website"
              description="Use the organization's own site when possible, not a registration or social page."
              value={form.website}
              onChange={handleFieldChange('website')}
              placeholder="https://example.com"
              type="url"
            />
            <LocationSelector
              value={form.location}
              coordinates={{
                lat: coordinates?.lat ?? DEFAULT_COORDINATES.lat,
                lng: coordinates?.lng ?? DEFAULT_COORDINATES.lng,
              }}
              onChange={(location, lat, lng, address) => {
                setForm((prev) => ({ ...prev, location, address: address ?? '' }));
                setCoordinates({ lat, lng });
              }}
              isValid={Boolean(form.location.trim()) && coordinatesPresent}
            />

            {matching && (
              <Group gap="xs">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">Checking existing profiles…</Text>
              </Group>
            )}

            {!matching && matchResult && matchResult.matches.length === 0 && (
              <Alert color="teal" title="No matching profile found">
                You can continue and create a new organization.
              </Alert>
            )}

            {matchResult && matchResult.matches.length > 0 && (
              <Stack gap="sm">
                <div>
                  <Text fw={650}>We found existing profiles</Text>
                  <Text size="sm" c="dimmed">
                    Review these before creating a new organization.
                  </Text>
                </div>
                {matchResult.matches.map((match) => (
                  <Paper key={match.organizationId} withBorder radius="md" p="md">
                    <Stack gap="sm">
                      <Group align="flex-start" wrap="nowrap">
                        <Avatar src={match.logoUrl} name={match.name} radius="md" size={48} />
                        <div className="min-w-0 flex-1">
                          <Group justify="space-between" align="flex-start" gap="xs">
                            <div>
                              <Text fw={650}>{match.name}</Text>
                              {match.approximateLocation && (
                                <Text size="sm" c="dimmed">{match.approximateLocation}</Text>
                              )}
                            </div>
                            <Badge
                              variant="light"
                              color={match.confidence === 'EXACT' ? 'red' : 'gray'}
                            >
                              {match.confidence === 'EXACT' ? 'Match' : 'Possible match'}
                            </Badge>
                          </Group>
                          <Text size="sm" mt={6}>{matchExplanation(match)}</Text>
                        </div>
                      </Group>
                      {renderMatchActions(match)}
                      <Divider />
                      <Group gap="xs">
                        <Badge
                          variant="light"
                          color={match.ownershipStatus === 'UNCLAIMED' ? 'gray' : 'blue'}
                        >
                          {ownershipBadgeLabel(match)}
                        </Badge>
                      </Group>
                    </Stack>
                  </Paper>
                ))}
                {matchResult.matches.every((match) => !match.blocksCreation) && (
                  <Checkbox
                    checked={differentOrganizationConfirmed}
                    onChange={(event) => setDifferentOrganizationConfirmed(event.currentTarget.checked)}
                    label="This is a different organization from the profiles above."
                  />
                )}
              </Stack>
            )}

            {matchError && (
              <Alert color="red" radius="md">
                {matchError}
              </Alert>
            )}

            <Group justify="space-between" pt="sm">
              <Button variant="default" onClick={onClose} disabled={matching}>Cancel</Button>
              <Button
                type="submit"
                loading={matching}
                disabled={
                  !form.name.trim()
                  || !form.location.trim()
                  || !coordinatesPresent
                  || Boolean(matchResult?.matches.some((match) => match.blocksCreation))
                }
              >
                Continue
              </Button>
            </Group>
          </>
        ) : (
          <>
            {!isEditing ? (
              <Paper withBorder radius="md" p="md">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text fw={650}>{form.name}</Text>
                    <Text size="sm" c="dimmed">{form.location}</Text>
                    {form.website && <Text size="sm">{form.website}</Text>}
                  </div>
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => {
                      setCreateStep('match');
                      setError(null);
                    }}
                  >
                    Change
                  </Button>
                </Group>
              </Paper>
            ) : (
              <>
                <TextInput
                  label="Name"
                  value={form.name}
                  onChange={handleFieldChange('name')}
                  placeholder="Organization name"
                  required
                  maxLength={80}
                />
                <TextInput
                  label="Website"
                  value={form.website}
                  onChange={handleFieldChange('website')}
                  placeholder="https://example.com"
                  type="url"
                />
              </>
            )}
            <Textarea
              label="Description"
              value={form.description}
              onChange={handleFieldChange('description')}
              placeholder="Tell people what your organization does"
              autosize minRows={3}
              maxLength={500}
            />
            <Select
              label="Visibility"
              description="Unlisted organizations stay out of discover pages but can still be opened with a direct link."
              value={form.status}
              onChange={(value) => setForm((prev) => ({
                ...prev,
                status: getOrganizationStatus(value),
              }))}
              data={ORGANIZATION_STATUS_OPTIONS}
              required
            />
            <div>
              <OrganizationTagsInput
                value={form.tags}
                options={tagOptions}
                disabled={submitting}
                error={tagOptionsError ?? undefined}
                onChange={(tags) => setForm((prev) => ({ ...prev, tags }))}
              />
            </div>
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
            {isEditing && (
              <LocationSelector
                value={form.location}
                coordinates={{
                  lat: coordinates?.lat ?? DEFAULT_COORDINATES.lat,
                  lng: coordinates?.lng ?? DEFAULT_COORDINATES.lng,
                }}
                onChange={(location, lat, lng, address) => {
                  setForm((prev) => ({ ...prev, location, address: address ?? '' }));
                  setCoordinates({ lat, lng });
                }}
                isValid={Boolean(form.location.trim()) && coordinatesPresent}
              />
            )}
            <div className="space-y-3 rounded-md border border-slate-200 p-4">
              <Text fw={600} size="sm">Organization tools</Text>
              <Text size="xs" c="dimmed">
                Enable only the management areas this organization uses.
              </Text>
              <Checkbox.Group
                value={form.enabledFeatures}
                onChange={(values) => setForm((prev) => ({
                  ...prev,
                  enabledFeatures: values.filter((value): value is OrganizationFeature => (
                    ORGANIZATION_FEATURE_OPTIONS.some((option) => option.value === value)
                  )),
                }))}
              >
                <Stack gap="sm">
                  {ORGANIZATION_FEATURE_OPTIONS.map((option) => (
                    <Checkbox
                      key={option.value}
                      value={option.value}
                      label={(
                        <div>
                          <Text size="sm" fw={500}>{option.label}</Text>
                          <Text size="xs" c="dimmed">{option.description}</Text>
                        </div>
                      )}
                    />
                  ))}
                </Stack>
              </Checkbox.Group>
            </div>
            <div className="space-y-3 rounded-md border border-slate-200 p-4">
              <Text fw={600} size="sm">Tax settings</Text>
              <Select
                label="Organization type"
                value={form.taxOrganizationType}
                onChange={(value) => setForm((prev) => ({
                  ...prev,
                  taxOrganizationType: normalizeOrganizationTaxClassification(value),
                }))}
                data={[
                  { value: 'INDIVIDUAL_OR_CLUB', label: 'Individual or club' },
                  { value: 'NONPROFIT_OR_ASSOCIATION', label: 'Nonprofit or association' },
                  { value: 'FACILITY_OPERATOR', label: 'Facility operator' },
                  { value: 'BUSINESS_OTHER', label: 'Other business' },
                ]}
                required
              />
              <Checkbox
                label="This organization operates or rents out an athletic facility"
                checked={form.operatesAthleticFacility}
                onChange={handleCheckboxChange('operatesAthleticFacility')}
              />
              <Select
                label="Default sports event registration tax handling"
                value={form.defaultEventTaxHandling}
                onChange={(value) => setForm((prev) => ({
                  ...prev,
                  defaultEventTaxHandling: normalizeOrganizationDefaultEventTaxHandling(value),
                }))}
                data={[
                  { value: 'STRIPE_TAX', label: 'Use Stripe Tax' },
                  { value: 'EXEMPT_PARTICIPANT_SPORTS', label: 'Treat participant sports registration as exempt' },
                ]}
                required
              />
              <Text size="xs" c="dimmed">
                Facility rentals use Stripe Tax. Processing costs are included in the prices customers see.
              </Text>
              <Checkbox
                label="I confirm this organization is responsible for determining taxability for its events and rentals."
                checked={form.taxResponsibilityAgreementAccepted}
                onChange={handleCheckboxChange('taxResponsibilityAgreementAccepted')}
                required
              />
            </div>
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
              <Button
                variant="default"
                onClick={isEditing ? onClose : () => setCreateStep('match')}
                disabled={submitting}
              >
                {isEditing ? 'Cancel' : 'Back'}
              </Button>
              <Button type="submit" loading={submitting} disabled={submitting || !form.name.trim()}>
                {submitLabel}
              </Button>
            </Group>
          </>
        )}
      </form>
    </Modal>
  );
}

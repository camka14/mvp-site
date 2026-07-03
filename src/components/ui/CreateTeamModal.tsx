'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Button, Group, TextInput, Select as MantineSelect, NumberInput, SimpleGrid, Checkbox, MultiSelect, Text } from '@mantine/core';
import { Team, UserData, SPORTS_LIST, type TeamJoinPolicy } from '@/types';
import { apiRequest } from '@/lib/apiClient';
import { teamService } from '@/lib/teamService';
import {
  buildDivisionName,
  getDivisionTypeOptionsForSport,
} from '@/lib/divisionTypes';
import { ImageUploader } from './ImageUploader';

interface CreateTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserData | null;
  onTeamCreated?: (team: Team) => void;
  organizationId?: string;
}

const DIVISION_GENDER_OPTIONS = [
  { value: 'M', label: "Men's" },
  { value: 'F', label: "Women's" },
  { value: 'C', label: 'Coed' },
] as const;

const TEAM_JOIN_POLICY_OPTIONS: Array<{ value: TeamJoinPolicy; label: string }> = [
  { value: 'CLOSED', label: 'Closed' },
  { value: 'OPEN_REGISTRATION', label: 'Open registration' },
  { value: 'REQUEST_TO_JOIN', label: 'Request to join' },
];

const DEFAULT_AGE_DIVISION_FALLBACK = '18plus';

const normalizeDivisionToken = (value: unknown): string => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const TEAM_SIZE_WARNING = 'Team size must be 2 or above.';

type TeamSizeInputValue = string | number;
type DivisionGenderInput = 'M' | 'F' | 'C' | '';
type UserDataWithApiId = UserData & { id?: unknown };

const parseTeamSizeInput = (value: TeamSizeInputValue): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  const parsedValue = Number(trimmedValue);
  return Number.isFinite(parsedValue) ? Math.trunc(parsedValue) : null;
};

const normalizeUserIdValue = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length ? normalized : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const getCurrentUserId = (user: UserDataWithApiId | null | undefined): string => (
  normalizeUserIdValue(user?.$id) ?? normalizeUserIdValue(user?.id) ?? ''
);

const buildCompositeDivisionTypeId = (skillDivisionTypeId: string, ageDivisionTypeId: string): string => {
  const normalizedSkill = normalizeDivisionToken(skillDivisionTypeId) || 'open';
  const normalizedAge = normalizeDivisionToken(ageDivisionTypeId) || DEFAULT_AGE_DIVISION_FALLBACK;
  return `skill_${normalizedSkill}_age_${normalizedAge}`;
};

const isJoinableTeamPolicy = (joinPolicy: TeamJoinPolicy): boolean => (
  joinPolicy === 'OPEN_REGISTRATION' || joinPolicy === 'REQUEST_TO_JOIN'
);

export default function CreateTeamModal({ isOpen, onClose, currentUser, onTeamCreated, organizationId }: CreateTeamModalProps) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeamImageUrl, setSelectedTeamImageUrl] = useState('');
  const [name, setName] = useState('');
  const [sport, setSport] = useState('');
  const [joinPolicy, setJoinPolicy] = useState<TeamJoinPolicy>('CLOSED');
  const [registrationPriceDollars, setRegistrationPriceDollars] = useState<TeamSizeInputValue>(0);
  const [divisionGender, setDivisionGender] = useState<DivisionGenderInput>('');
  const [skillDivisionTypeId, setSkillDivisionTypeId] = useState('');
  const [ageDivisionTypeId, setAgeDivisionTypeId] = useState('');
  const [divisionPreview, setDivisionPreview] = useState('');
  const [teamSize, setTeamSize] = useState<TeamSizeInputValue>(6);
  const [addSelfAsPlayer, setAddSelfAsPlayer] = useState(true);
  const [profileImageId, setProfileImageId] = useState('');
  const [isAffiliateRegistration, setIsAffiliateRegistration] = useState(false);
  const [affiliateUrl, setAffiliateUrl] = useState('');
  const [templateOptions, setTemplateOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedRequiredTemplateIds, setSelectedRequiredTemplateIds] = useState<string[]>([]);

  const sportOptions = useMemo(() => (
    Array.from(new Set([...SPORTS_LIST, sport].map((value) => value.trim()).filter((value) => value.length > 0)))
      .map((value) => ({ value, label: value }))
  ), [sport]);

  const divisionTypeOptions = useMemo(
    () => getDivisionTypeOptionsForSport(sport),
    [sport],
  );
  const parsedTeamSize = useMemo(() => parseTeamSizeInput(teamSize), [teamSize]);
  const teamSizeWarning = parsedTeamSize === null || parsedTeamSize < 2 ? TEAM_SIZE_WARNING : null;
  const currentUserId = useMemo(() => getCurrentUserId(currentUser), [currentUser]);
  const canChargeRegistration = Boolean(currentUser?.hasStripeAccount);
  const effectiveJoinPolicy: TeamJoinPolicy = isAffiliateRegistration ? 'OPEN_REGISTRATION' : joinPolicy;
  const registrationEnabled = isJoinableTeamPolicy(effectiveJoinPolicy);
  const showDivisionFields = registrationEnabled && !isAffiliateRegistration && sport.trim().length > 0;

  const skillDivisionOptions = useMemo(
    () => divisionTypeOptions
      .filter((option) => option.ratingType === 'SKILL')
      .map((option) => ({ value: option.id, label: option.name })),
    [divisionTypeOptions],
  );

  const ageDivisionOptions = useMemo(
    () => divisionTypeOptions
      .filter((option) => option.ratingType === 'AGE')
      .map((option) => ({ value: option.id, label: option.name })),
    [divisionTypeOptions],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (!organizationId) {
      setTemplateOptions([]);
      setTemplatesLoading(false);
      setSelectedRequiredTemplateIds([]);
      return;
    }

    let cancelled = false;
    const loadTemplates = async () => {
      try {
        setTemplatesLoading(true);
        const response = await apiRequest<{ templates?: any[] }>(`/api/organizations/${organizationId}/templates`);
        if (cancelled) {
          return;
        }
        const rows = Array.isArray(response.templates) ? response.templates : [];
        const options = rows
          .map((row) => ({
            value: String(row.$id ?? row.id ?? '').trim(),
            label: String(row.title ?? 'Untitled template'),
            status: String(row.status ?? '').trim().toUpperCase(),
          }))
          .filter((row) => row.value.length > 0 && row.status !== 'ARCHIVED')
          .map(({ value, label }) => ({ value, label }));
        setTemplateOptions(options);
      } catch (loadError) {
        if (!cancelled) {
          setTemplateOptions([]);
        }
      } finally {
        if (!cancelled) {
          setTemplatesLoading(false);
        }
      }
    };

    void loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [isOpen, organizationId]);

  useEffect(() => {
    if (!registrationEnabled) {
      setRegistrationPriceDollars(0);
    }
  }, [registrationEnabled]);

  useEffect(() => {
    if (!showDivisionFields) {
      setDivisionGender('');
      setSkillDivisionTypeId('');
      setAgeDivisionTypeId('');
      setDivisionPreview('');
      return;
    }

    const normalizedSkill = normalizeDivisionToken(skillDivisionTypeId);
    const normalizedAge = normalizeDivisionToken(ageDivisionTypeId);
    const hasSkill = normalizedSkill.length > 0 && skillDivisionOptions.some((option) => option.value === normalizedSkill);
    const hasAge = normalizedAge.length > 0 && ageDivisionOptions.some((option) => option.value === normalizedAge);

    if (skillDivisionTypeId && !hasSkill) {
      setSkillDivisionTypeId('');
    }
    if (ageDivisionTypeId && !hasAge) {
      setAgeDivisionTypeId('');
    }
  }, [
    ageDivisionOptions,
    ageDivisionTypeId,
    registrationEnabled,
    showDivisionFields,
    skillDivisionOptions,
    skillDivisionTypeId,
  ]);

  useEffect(() => {
    const nextSkillDivisionTypeId = normalizeDivisionToken(skillDivisionTypeId);
    const nextAgeDivisionTypeId = normalizeDivisionToken(ageDivisionTypeId);
    if (!showDivisionFields || !divisionGender || !nextSkillDivisionTypeId || !nextAgeDivisionTypeId) {
      setDivisionPreview('');
      return;
    }
    setDivisionPreview(
      buildDivisionName({
        gender: divisionGender,
        sportInput: sport,
        skillDivisionTypeId: nextSkillDivisionTypeId,
        ageDivisionTypeId: nextAgeDivisionTypeId,
      }),
    );
  }, [ageDivisionTypeId, divisionGender, showDivisionFields, skillDivisionTypeId, sport]);

  const resetForm = () => {
    setName('');
    setSport('');
    setJoinPolicy('CLOSED');
    setRegistrationPriceDollars(0);
    setDivisionGender('');
    setSkillDivisionTypeId('');
    setAgeDivisionTypeId('');
    setDivisionPreview('');
    setTeamSize(6);
    setAddSelfAsPlayer(true);
    setProfileImageId('');
    setIsAffiliateRegistration(false);
    setAffiliateUrl('');
    setSelectedTeamImageUrl('');
    setSelectedRequiredTemplateIds([]);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    const nextSport = sport.trim();
    const nextSkillDivisionTypeId = normalizeDivisionToken(skillDivisionTypeId);
    const nextAgeDivisionTypeId = normalizeDivisionToken(ageDivisionTypeId);
    const nextTeamSize = parseTeamSizeInput(teamSize);
    const nextAffiliateUrl = affiliateUrl.trim();
    const nextJoinPolicy: TeamJoinPolicy = isAffiliateRegistration ? 'OPEN_REGISTRATION' : joinPolicy;
    const nextRegistrationEnabled = isJoinableTeamPolicy(nextJoinPolicy);
    const nextRequiresDivision = nextRegistrationEnabled && !isAffiliateRegistration;
    const nextRegistrationPriceCents = nextAffiliateUrl
      ? 0
      : nextJoinPolicy === 'REQUEST_TO_JOIN'
        ? Math.max(0, Math.round((Number(registrationPriceDollars) || 0) * 100))
        : nextJoinPolicy === 'OPEN_REGISTRATION' && canChargeRegistration
          ? Math.max(0, Math.round((Number(registrationPriceDollars) || 0) * 100))
          : 0;

    if (!trimmedName) {
      setError('Team name is required.');
      return;
    }
    if (!nextSport) {
      setError('Sport is required.');
      return;
    }
    if (nextRequiresDivision && (!divisionGender || !nextSkillDivisionTypeId || !nextAgeDivisionTypeId)) {
      setError('Select gender, skill division, and age division.');
      return;
    }
    if (nextTeamSize === null || nextTeamSize < 2) {
      setError(TEAM_SIZE_WARNING);
      return;
    }
    if (!currentUserId) {
      setError('Sign in again before creating a team.');
      return;
    }
    if (isAffiliateRegistration && !nextAffiliateUrl) {
      setError('Affiliate registration link is required.');
      return;
    }

    const nextDivisionTypeId = nextRequiresDivision
      ? buildCompositeDivisionTypeId(nextSkillDivisionTypeId, nextAgeDivisionTypeId)
      : undefined;
    const nextDivision = nextRequiresDivision
      ? buildDivisionName({
          gender: divisionGender || 'C',
          sportInput: nextSport,
          skillDivisionTypeId: nextSkillDivisionTypeId,
          ageDivisionTypeId: nextAgeDivisionTypeId,
        })
      : '';

    setError(null);
    setCreating(true);
    try {
      const newTeam = await teamService.createTeam(
        trimmedName,
        currentUserId,
        nextDivision,
        nextSport,
        nextTeamSize,
        profileImageId || undefined,
        {
          divisionTypeId: nextDivisionTypeId,
          addSelfAsPlayer,
          organizationId,
          affiliateUrl: isAffiliateRegistration ? nextAffiliateUrl : null,
          joinPolicy: nextJoinPolicy,
          openRegistration: nextJoinPolicy === 'OPEN_REGISTRATION',
          registrationPriceCents: nextRegistrationPriceCents,
          requiredTemplateIds: organizationId ? selectedRequiredTemplateIds : [],
        },
      );
      if (newTeam) {
        onTeamCreated?.(newTeam);
        resetForm();
        onClose();
      }
    } catch (err) {
      console.error('Failed to create team:', err);
      setError(err instanceof Error ? err.message : 'Failed to create team.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal opened={isOpen} onClose={onClose} title="Create New Team" size="md" centered>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}

        <div>
          <TextInput
            label="Team Name"
            placeholder="Enter team name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            required
            maxLength={50}
          />
        </div>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
          <NumberInput
            label="Team Size"
            min={0}
            allowDecimal={false}
            value={teamSize}
            onChange={(value) => setTeamSize(value)}
            error={teamSizeWarning}
          />
          <MantineSelect
            label="Sport"
            data={sportOptions}
            value={sport || null}
            onChange={(value) => setSport(value || '')}
            searchable
            clearable
            nothingFoundMessage="No sports found"
          />
        </SimpleGrid>

        <MantineSelect
          label="Join mode"
          data={TEAM_JOIN_POLICY_OPTIONS}
          value={effectiveJoinPolicy}
          onChange={(value) => {
            const nextPolicy = (value || 'CLOSED') as TeamJoinPolicy;
            setJoinPolicy(nextPolicy);
            if (nextPolicy === 'CLOSED') {
              setIsAffiliateRegistration(false);
              setAffiliateUrl('');
            }
          }}
          allowDeselect={false}
          disabled={isAffiliateRegistration}
        />
        <Text size="xs" c="dimmed">
          {effectiveJoinPolicy === 'OPEN_REGISTRATION'
            ? 'Players can join this team without an invite.'
            : effectiveJoinPolicy === 'REQUEST_TO_JOIN'
              ? 'Players submit a request first. Managers approve before any bill is sent.'
              : 'Players need an invite to join this team.'}
        </Text>

        {registrationEnabled && !isAffiliateRegistration ? (
          <NumberInput
            label="Registration price"
            description={
              effectiveJoinPolicy === 'REQUEST_TO_JOIN'
                ? 'Shown as an expected cost and default bill amount. Players are not prompted to pay when requesting.'
                : canChargeRegistration
                  ? 'Leave at $0 for free registration.'
                  : 'Connect Stripe to charge for open registration. Free registration is still available.'
            }
            min={0}
            decimalScale={2}
            fixedDecimalScale
            prefix="$"
            value={registrationPriceDollars}
            onChange={(value) => {
              const numeric = typeof value === 'number' ? value : Number(value);
              setRegistrationPriceDollars(Number.isFinite(numeric) ? Math.max(0, numeric) : 0);
            }}
            disabled={effectiveJoinPolicy === 'OPEN_REGISTRATION' && !canChargeRegistration}
          />
        ) : null}

        {showDivisionFields ? (
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
            <MantineSelect
              label="Gender"
              data={DIVISION_GENDER_OPTIONS.map((option) => ({ ...option }))}
              value={divisionGender || null}
              onChange={(value) => setDivisionGender((value as DivisionGenderInput) || '')}
              clearable
            />
            <MantineSelect
              label="Skill Division"
              data={skillDivisionOptions}
              value={skillDivisionTypeId || null}
              onChange={(value) => setSkillDivisionTypeId(value || '')}
              searchable
              clearable
            />
            <MantineSelect
              label="Age Division"
              data={ageDivisionOptions}
              value={ageDivisionTypeId || null}
              onChange={(value) => setAgeDivisionTypeId(value || '')}
              searchable
              clearable
            />
            <TextInput
              label="Division Preview"
              value={divisionPreview}
              readOnly
            />
          </SimpleGrid>
        ) : null}

        <Checkbox
          label="Add me as a player"
          description="If enabled, you will also be set as team captain. You will always be set as team manager."
          checked={addSelfAsPlayer}
          onChange={(e) => setAddSelfAsPlayer(e.currentTarget.checked)}
        />

        <div className="space-y-3">
          <Checkbox
            label="External team registration"
            description="Players will register through the linked site instead of BracketIQ."
            checked={isAffiliateRegistration}
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              setIsAffiliateRegistration(checked);
              if (checked) {
                setJoinPolicy('OPEN_REGISTRATION');
                setRegistrationPriceDollars(0);
              }
            }}
          />
          {isAffiliateRegistration ? (
            <TextInput
              label="Affiliate registration link"
              value={affiliateUrl}
              onChange={(event) => setAffiliateUrl(event.currentTarget.value)}
              placeholder="https://example.com/team-registration"
              required
            />
          ) : null}
        </div>

        {organizationId && (
          <div>
            <MultiSelect
              label="Required Documents"
              data={templateOptions}
              value={selectedRequiredTemplateIds}
              onChange={setSelectedRequiredTemplateIds}
              placeholder={templatesLoading ? 'Loading templates...' : 'Select templates'}
              searchable
              clearable
              disabled={templatesLoading}
              nothingFoundMessage="No templates found"
            />
            {!templatesLoading && templateOptions.length === 0 && (
              <Text size="xs" c="dimmed" mt={4}>
                No templates available for this organization yet.
              </Text>
            )}
          </div>
        )}

        <div>
          <label className="form-label">Team Logo (Optional)</label>
          <ImageUploader
            currentImageUrl={selectedTeamImageUrl}
            className="w-full"
            placeholder="Select team logo"
            onChange={(fileId, url) => {
              setSelectedTeamImageUrl(url);
              setProfileImageId(fileId);
            }}
          />
        </div>

        <Group justify="space-between" pt="sm">
          <Button variant="default" onClick={onClose} disabled={creating}>Cancel</Button>
          <Button type="submit" disabled={creating || !name.trim()}>{creating ? 'Creating…' : 'Create Team'}</Button>
        </Group>
      </form>
    </Modal>
  );
}

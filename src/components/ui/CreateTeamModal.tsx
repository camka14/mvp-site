'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Button, Group, TextInput, Select as MantineSelect, NumberInput, SimpleGrid, Checkbox, MultiSelect, Text } from '@mantine/core';
import { Team, UserData, SPORTS_LIST } from '@/types';
import { apiRequest } from '@/lib/apiClient';
import { teamService } from '@/lib/teamService';
import {
  buildDivisionName,
  getDivisionTypeById,
  getDivisionTypeOptionsForSport,
} from '@/lib/divisionTypes';
import { ImageUploader } from './ImageUploader';

interface CreateTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserData;
  onTeamCreated?: (team: Team) => void;
  organizationId?: string;
}

const DIVISION_GENDER_OPTIONS = [
  { value: 'M', label: 'Mens' },
  { value: 'F', label: 'Womens' },
  { value: 'C', label: 'CoEd' },
] as const;

const DEFAULT_SPORT = SPORTS_LIST.includes('Indoor Volleyball')
  ? 'Indoor Volleyball'
  : (SPORTS_LIST[0] ?? 'Other');
const DEFAULT_AGE_DIVISION_FALLBACK = '18plus';
const PREFERRED_AGE_DIVISION_IDS = ['18plus', '19plus', 'u18', '18u', 'u19', '19u'] as const;

const normalizeDivisionToken = (value: unknown): string => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const humanizeDivisionTypeId = (value: string): string => value
  .split('_')
  .filter(Boolean)
  .map((chunk) => (chunk.length <= 3 ? chunk.toUpperCase() : `${chunk.charAt(0).toUpperCase()}${chunk.slice(1)}`))
  .join(' ');

const resolveDivisionTypeName = (
  sportInput: string | null | undefined,
  divisionTypeId: string,
  ratingType: 'AGE' | 'SKILL',
): string => {
  const normalizedId = normalizeDivisionToken(divisionTypeId);
  if (!normalizedId.length) {
    return ratingType === 'SKILL' ? 'Open' : '18+';
  }
  return getDivisionTypeById(sportInput ?? null, normalizedId, ratingType)?.name ?? humanizeDivisionTypeId(normalizedId);
};

const getDefaultDivisionTypeSelections = (sportInput: string | null | undefined): {
  skillDivisionTypeId: string;
  ageDivisionTypeId: string;
} => {
  const options = getDivisionTypeOptionsForSport(sportInput);
  const skill = options.find((option) => option.ratingType === 'SKILL' && option.id === 'open')
    ?? options.find((option) => option.ratingType === 'SKILL');
  let age: (typeof options)[number] | undefined;
  for (const preferredAgeId of PREFERRED_AGE_DIVISION_IDS) {
    age = options.find((option) => option.ratingType === 'AGE' && option.id === preferredAgeId);
    if (age) break;
  }
  if (!age) {
    age = options.find((option) => option.ratingType === 'AGE');
  }
  return {
    skillDivisionTypeId: skill?.id ?? 'open',
    ageDivisionTypeId: age?.id ?? DEFAULT_AGE_DIVISION_FALLBACK,
  };
};

const INITIAL_DIVISION_SELECTIONS = getDefaultDivisionTypeSelections(DEFAULT_SPORT);

const buildCompositeDivisionTypeId = (skillDivisionTypeId: string, ageDivisionTypeId: string): string => {
  const normalizedSkill = normalizeDivisionToken(skillDivisionTypeId) || 'open';
  const normalizedAge = normalizeDivisionToken(ageDivisionTypeId) || DEFAULT_AGE_DIVISION_FALLBACK;
  return `skill_${normalizedSkill}_age_${normalizedAge}`;
};

export default function CreateTeamModal({ isOpen, onClose, currentUser, onTeamCreated, organizationId }: CreateTeamModalProps) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeamImageUrl, setSelectedTeamImageUrl] = useState('');
  const [name, setName] = useState('');
  const [sport, setSport] = useState(DEFAULT_SPORT);
  const [divisionGender, setDivisionGender] = useState<'M' | 'F' | 'C'>('C');
  const [skillDivisionTypeId, setSkillDivisionTypeId] = useState('open');
  const [ageDivisionTypeId, setAgeDivisionTypeId] = useState(INITIAL_DIVISION_SELECTIONS.ageDivisionTypeId);
  const [divisionPreview, setDivisionPreview] = useState('');
  const [teamSize, setTeamSize] = useState(6);
  const [addSelfAsPlayer, setAddSelfAsPlayer] = useState(true);
  const [profileImageId, setProfileImageId] = useState('');
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
    const fallback = getDefaultDivisionTypeSelections(sport);
    const normalizedSkill = normalizeDivisionToken(skillDivisionTypeId);
    const normalizedAge = normalizeDivisionToken(ageDivisionTypeId);
    const hasSkill = skillDivisionOptions.some((option) => option.value === normalizedSkill);
    const hasAge = ageDivisionOptions.some((option) => option.value === normalizedAge);

    if (!hasSkill && fallback.skillDivisionTypeId !== skillDivisionTypeId) {
      setSkillDivisionTypeId(fallback.skillDivisionTypeId);
    }
    if (!hasAge && fallback.ageDivisionTypeId !== ageDivisionTypeId) {
      setAgeDivisionTypeId(fallback.ageDivisionTypeId);
    }
  }, [
    ageDivisionOptions,
    ageDivisionTypeId,
    skillDivisionOptions,
    skillDivisionTypeId,
    sport,
  ]);

  useEffect(() => {
    const nextSkillDivisionTypeId = normalizeDivisionToken(skillDivisionTypeId);
    const nextAgeDivisionTypeId = normalizeDivisionToken(ageDivisionTypeId);
    const nextSkillDivisionTypeName = resolveDivisionTypeName(sport, nextSkillDivisionTypeId, 'SKILL');
    const nextAgeDivisionTypeName = resolveDivisionTypeName(sport, nextAgeDivisionTypeId, 'AGE');
    const nextDivisionTypeName = `${nextSkillDivisionTypeName} • ${nextAgeDivisionTypeName}`;
    setDivisionPreview(
      buildDivisionName({
        gender: divisionGender,
        divisionTypeName: nextDivisionTypeName,
      }),
    );
  }, [ageDivisionTypeId, divisionGender, skillDivisionTypeId, sport]);

  const resetForm = () => {
    const defaults = getDefaultDivisionTypeSelections(DEFAULT_SPORT);
    setName('');
    setSport(DEFAULT_SPORT);
    setDivisionGender('C');
    setSkillDivisionTypeId(defaults.skillDivisionTypeId);
    setAgeDivisionTypeId(defaults.ageDivisionTypeId);
    setDivisionPreview('');
    setTeamSize(6);
    setAddSelfAsPlayer(true);
    setProfileImageId('');
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
    const nextTeamSize = Math.max(1, Math.trunc(Number(teamSize) || 0));

    if (!trimmedName) {
      setError('Team name is required.');
      return;
    }
    if (!nextSport) {
      setError('Sport is required.');
      return;
    }
    if (!nextSkillDivisionTypeId || !nextAgeDivisionTypeId) {
      setError('Select both skill and age divisions.');
      return;
    }

    const nextDivisionTypeId = buildCompositeDivisionTypeId(nextSkillDivisionTypeId, nextAgeDivisionTypeId);
    const nextSkillDivisionTypeName = resolveDivisionTypeName(nextSport, nextSkillDivisionTypeId, 'SKILL');
    const nextAgeDivisionTypeName = resolveDivisionTypeName(nextSport, nextAgeDivisionTypeId, 'AGE');
    const nextDivisionTypeName = `${nextSkillDivisionTypeName} • ${nextAgeDivisionTypeName}`;
    const nextDivision = buildDivisionName({
      gender: divisionGender,
      divisionTypeName: nextDivisionTypeName,
    });

    setError(null);
    setCreating(true);
    try {
      const newTeam = await teamService.createTeam(
        trimmedName,
        currentUser.$id,
        nextDivision,
        nextSport,
        nextTeamSize,
        profileImageId || undefined,
        {
          divisionTypeId: nextDivisionTypeId,
          divisionTypeName: nextDivisionTypeName,
          addSelfAsPlayer,
          organizationId,
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
          <MantineSelect
            label="Sport"
            data={sportOptions}
            value={sport || null}
            onChange={(value) => setSport(value || '')}
            searchable
            allowDeselect={false}
            nothingFoundMessage="No sports found"
          />
          <MantineSelect
            label="Division Gender"
            data={DIVISION_GENDER_OPTIONS.map((option) => ({ ...option }))}
            value={divisionGender}
            onChange={(value) => setDivisionGender((value as 'M' | 'F' | 'C') || 'C')}
            allowDeselect={false}
          />
          <MantineSelect
            label="Skill Division"
            data={skillDivisionOptions}
            value={skillDivisionTypeId}
            onChange={(value) => setSkillDivisionTypeId(value || 'open')}
            searchable
            allowDeselect={false}
          />
          <MantineSelect
            label="Age Division"
            data={ageDivisionOptions}
            value={ageDivisionTypeId}
            onChange={(value) => setAgeDivisionTypeId(value || DEFAULT_AGE_DIVISION_FALLBACK)}
            searchable
            allowDeselect={false}
          />
          <TextInput
            label="Division Preview"
            value={divisionPreview}
            readOnly
          />
          <NumberInput
            label="Team Size"
            min={1}
            value={teamSize}
            onChange={(value) => setTeamSize(Number(value) || 1)}
          />
        </SimpleGrid>

        <Checkbox
          label="Add me as a player"
          description="If enabled, you will also be set as team captain. You will always be set as team manager."
          checked={addSelfAsPlayer}
          onChange={(e) => setAddSelfAsPlayer(e.currentTarget.checked)}
        />

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

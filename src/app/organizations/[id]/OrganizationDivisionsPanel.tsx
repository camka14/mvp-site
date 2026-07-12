'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Archive, Pencil, Plus } from 'lucide-react';
import type { Division, Organization } from '@/types';
import { organizationService } from '@/lib/organizationService';
import { useSports } from '@/app/hooks/useSports';

type DivisionTypeOption = { id: string; name: string };
type DivisionTypePayload = {
  genders?: DivisionTypeOption[];
  ages?: DivisionTypeOption[];
  sportSkills?: Array<{ sportId: string; skills: DivisionTypeOption[] }>;
};

type Props = {
  organization: Organization;
  canManage?: boolean;
  summary?: boolean;
  onViewAll?: () => void;
  onChanged?: (divisions: Division[]) => void;
};

const emptyDraft = {
  name: '',
  sportId: '',
  gender: 'C',
  skillDivisionTypeId: '',
  ageDivisionTypeId: '',
  priceDollars: 0,
  maxParticipants: null as number | null,
  description: '',
  registrationUrl: '',
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
};

const formatPrice = (price?: number): string => {
  if (typeof price !== 'number') return 'Not specified';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price / 100);
};

export default function OrganizationDivisionsPanel({
  organization,
  canManage = false,
  summary = false,
  onViewAll,
  onChanged,
}: Props) {
  const { sports } = useSports();
  const [divisions, setDivisions] = useState<Division[]>(organization.divisions ?? []);
  const [types, setTypes] = useState<DivisionTypePayload>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);

  useEffect(() => {
    let active = true;
    Promise.all([
      organizationService.listOrganizationDivisions(organization.$id, canManage),
      fetch('/api/division-types').then((response) => {
        if (!response.ok) throw new Error('Failed to load division options');
        return response.json() as Promise<DivisionTypePayload>;
      }),
    ])
      .then(([nextDivisions, nextTypes]) => {
        if (!active) return;
        setDivisions(nextDivisions);
        setTypes(nextTypes);
        onChanged?.(nextDivisions);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load divisions.');
      });
    return () => { active = false; };
  }, [canManage, onChanged, organization.$id]);

  const visibleDivisions = useMemo(
    () => divisions.filter((division) => canManage || division.status === 'ACTIVE'),
    [canManage, divisions],
  );
  const rows = summary ? visibleDivisions.slice(0, 4) : visibleDivisions;
  const sportOptions = sports.map((sport) => ({ value: sport.$id, label: sport.name }));
  const genderOptions = (types.genders ?? []).map((option) => ({ value: option.id, label: option.name }));
  const ageOptions = (types.ages ?? []).map((option) => ({ value: option.id, label: option.name }));
  const skillOptions = (types.sportSkills ?? [])
    .find((entry) => entry.sportId === draft.sportId)
    ?.skills.map((option) => ({ value: option.id, label: option.name })) ?? [];

  const openCreate = () => {
    const firstSport = sportOptions[0]?.value ?? '';
    const firstSkills = (types.sportSkills ?? []).find((entry) => entry.sportId === firstSport)?.skills ?? [];
    setEditingId(null);
    setDraft({
      ...emptyDraft,
      sportId: firstSport,
      skillDivisionTypeId: firstSkills[0]?.id ?? '',
      ageDivisionTypeId: types.ages?.[0]?.id ?? '',
    });
    setOpened(true);
  };

  const openEdit = (division: Division) => {
    setEditingId(division.id);
    setDraft({
      name: division.name,
      sportId: division.sportId ?? '',
      gender: division.gender ?? 'C',
      skillDivisionTypeId: division.skillDivisionTypeId ?? '',
      ageDivisionTypeId: division.ageDivisionTypeId ?? '',
      priceDollars: (division.price ?? 0) / 100,
      maxParticipants: division.maxParticipants ?? null,
      description: division.description ?? '',
      registrationUrl: division.registrationUrl ?? '',
      status: division.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    });
    setOpened(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: draft.name,
        sportId: draft.sportId,
        gender: draft.gender as 'M' | 'F' | 'C',
        skillDivisionTypeId: draft.skillDivisionTypeId,
        ageDivisionTypeId: draft.ageDivisionTypeId,
        price: Math.round(draft.priceDollars * 100),
        maxParticipants: draft.maxParticipants,
        description: draft.description,
        registrationUrl: draft.registrationUrl,
        status: draft.status,
      };
      if (editingId) {
        await organizationService.updateOrganizationDivision(organization.$id, editingId, payload);
      } else {
        await organizationService.createOrganizationDivision(organization.$id, payload);
      }
      const nextDivisions = await organizationService.listOrganizationDivisions(organization.$id, canManage);
      setDivisions(nextDivisions);
      onChanged?.(nextDivisions);
      setOpened(false);
      notifications.show({ color: 'teal', message: editingId ? 'Division updated.' : 'Division added.' });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save division.');
    } finally {
      setSaving(false);
    }
  };

  const archive = async (division: Division) => {
    setLoading(true);
    try {
      await organizationService.archiveOrganizationDivision(organization.$id, division.id);
      const nextDivisions = await organizationService.listOrganizationDivisions(organization.$id, canManage);
      setDivisions(nextDivisions);
      onChanged?.(nextDivisions);
      notifications.show({ color: 'teal', message: 'Division archived.' });
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Unable to archive division.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper withBorder p="md" radius="md" className="org-tab-surface">
      <Group justify="space-between" mb="md">
        <div>
          <Title order={5}>{summary ? 'Divisions Offered' : 'Club Divisions'}</Title>
          {!summary && <Text size="sm" c="dimmed">Current club offerings and total per-player prices.</Text>}
        </div>
        <Group gap="xs">
          {summary && onViewAll && visibleDivisions.length > 0 && (
            <Button variant="subtle" size="xs" onClick={onViewAll}>View all</Button>
          )}
          {canManage && !summary && (
            <Button leftSection={<Plus size={16} />} size="sm" onClick={openCreate}>Add division</Button>
          )}
        </Group>
      </Group>
      {error && <Alert color="red" mb="md">{error}</Alert>}
      {rows.length === 0 ? (
        <Text size="sm" c="dimmed">No club divisions have been added.</Text>
      ) : (
        <Table.ScrollContainer minWidth={720}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Division</Table.Th>
                <Table.Th>Sport</Table.Th>
                <Table.Th>Gender</Table.Th>
                <Table.Th>Age</Table.Th>
                <Table.Th>Skill</Table.Th>
                <Table.Th>Price</Table.Th>
                {canManage && !summary && <Table.Th aria-label="Actions" />}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((division) => (
                <Table.Tr key={division.id}>
                  <Table.Td>
                    <Text fw={600} size="sm">{division.name}</Text>
                    {division.status !== 'ACTIVE' && <Badge size="xs" color="gray">{division.status}</Badge>}
                  </Table.Td>
                  <Table.Td>{division.sportId ?? 'Not specified'}</Table.Td>
                  <Table.Td>{genderOptions.find((option) => option.value === division.gender)?.label ?? division.gender}</Table.Td>
                  <Table.Td>{ageOptions.find((option) => option.value === division.ageDivisionTypeId)?.label ?? division.ageDivisionTypeId}</Table.Td>
                  <Table.Td>{(types.sportSkills ?? []).find((entry) => entry.sportId === division.sportId)?.skills.find((option) => option.id === division.skillDivisionTypeId)?.name ?? division.skillDivisionTypeId}</Table.Td>
                  <Table.Td>{formatPrice(division.price)}</Table.Td>
                  {canManage && !summary && (
                    <Table.Td>
                      <Group gap="xs" justify="flex-end" wrap="nowrap">
                        <Tooltip label="Edit division">
                          <ActionIcon variant="subtle" onClick={() => openEdit(division)} aria-label={`Edit ${division.name}`}>
                            <Pencil size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Archive division">
                          <ActionIcon color="red" variant="subtle" loading={loading} onClick={() => void archive(division)} aria-label={`Archive ${division.name}`}>
                            <Archive size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <Modal opened={opened} onClose={() => setOpened(false)} title={editingId ? 'Edit club division' : 'Add club division'} centered>
        <Stack gap="sm">
          <Select label="Sport" data={sportOptions} value={draft.sportId} onChange={(value) => {
            const sportId = value ?? '';
            const firstSkill = (types.sportSkills ?? []).find((entry) => entry.sportId === sportId)?.skills[0]?.id ?? '';
            setDraft((current) => ({ ...current, sportId, skillDivisionTypeId: firstSkill }));
          }} required searchable />
          <Group grow align="flex-start">
            <Select label="Gender" data={genderOptions} value={draft.gender} onChange={(value) => setDraft((current) => ({ ...current, gender: value ?? 'C' }))} required />
            <Select label="Age" data={ageOptions} value={draft.ageDivisionTypeId} onChange={(value) => setDraft((current) => ({ ...current, ageDivisionTypeId: value ?? '' }))} required searchable />
          </Group>
          <Select label="Skill" data={skillOptions} value={draft.skillDivisionTypeId} onChange={(value) => setDraft((current) => ({ ...current, skillDivisionTypeId: value ?? '' }))} required searchable />
          <TextInput label="Division name" description="Leave blank to use the generated gender, skill, and age name." value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.currentTarget.value }))} />
          <Group grow align="flex-start">
            <NumberInput label="Total price per player" prefix="$" decimalScale={2} min={0} value={draft.priceDollars} onChange={(value) => setDraft((current) => ({ ...current, priceDollars: Number(value) || 0 }))} />
            <NumberInput label="Capacity" description="Optional" min={1} value={draft.maxParticipants ?? ''} onChange={(value) => setDraft((current) => ({ ...current, maxParticipants: value === '' ? null : Number(value) }))} />
          </Group>
          <Textarea label="Description" autosize minRows={3} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.currentTarget.value }))} />
          <TextInput label="Registration URL" type="url" value={draft.registrationUrl} onChange={(event) => setDraft((current) => ({ ...current, registrationUrl: event.currentTarget.value }))} />
          {editingId && <Select label="Status" data={[{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]} value={draft.status} onChange={(value) => setDraft((current) => ({ ...current, status: value === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE' }))} />}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>Cancel</Button>
            <Button loading={saving} onClick={() => void save()}>Save</Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}

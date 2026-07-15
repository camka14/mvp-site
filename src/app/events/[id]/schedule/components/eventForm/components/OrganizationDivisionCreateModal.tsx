import { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Group,
    Modal,
    NumberInput,
    Select,
    Stack,
    Textarea,
    TextInput,
} from '@mantine/core';

import { organizationService } from '@/lib/organizationService';
import type { Division } from '@/types';

export type OrganizationDivisionTypeOption = { id: string; name: string };
export type OrganizationDivisionTypePayload = {
    genders?: OrganizationDivisionTypeOption[];
    ages?: OrganizationDivisionTypeOption[];
    sportSkills?: Array<{ sportId: string; skills: OrganizationDivisionTypeOption[] }>;
};

type Props = {
    opened: boolean;
    organizationId: string;
    preferredSportId?: string;
    sportOptions: Array<{ value: string; label: string }>;
    divisionTypes: OrganizationDivisionTypePayload;
    onClose: () => void;
    onCreated: (division: Division) => void;
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
};

export const OrganizationDivisionCreateModal = ({
    opened,
    organizationId,
    preferredSportId,
    sportOptions,
    divisionTypes,
    onClose,
    onCreated,
}: Props) => {
    const [draft, setDraft] = useState(emptyDraft);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const genderOptions = useMemo(
        () => (divisionTypes.genders ?? []).map((option) => ({ value: option.id, label: option.name })),
        [divisionTypes.genders],
    );
    const ageOptions = useMemo(
        () => (divisionTypes.ages ?? []).map((option) => ({ value: option.id, label: option.name })),
        [divisionTypes.ages],
    );
    const skillOptions = useMemo(
        () => (divisionTypes.sportSkills ?? [])
            .find((entry) => entry.sportId === draft.sportId)
            ?.skills.map((option) => ({ value: option.id, label: option.name })) ?? [],
        [divisionTypes.sportSkills, draft.sportId],
    );

    useEffect(() => {
        if (!opened) return;
        const sportId = sportOptions.some((option) => option.value === preferredSportId)
            ? preferredSportId as string
            : sportOptions[0]?.value ?? '';
        const firstSkill = (divisionTypes.sportSkills ?? [])
            .find((entry) => entry.sportId === sportId)
            ?.skills[0]?.id ?? '';
        setDraft({
            ...emptyDraft,
            sportId,
            skillDivisionTypeId: firstSkill,
            ageDivisionTypeId: divisionTypes.ages?.[0]?.id ?? '',
        });
        setError(null);
    }, [divisionTypes.ages, divisionTypes.sportSkills, opened, preferredSportId, sportOptions]);

    const canSave = Boolean(
        draft.sportId
        && draft.gender
        && draft.skillDivisionTypeId
        && draft.ageDivisionTypeId,
    );

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            const division = await organizationService.createOrganizationDivision(organizationId, {
                name: draft.name,
                sportId: draft.sportId,
                gender: draft.gender as 'M' | 'F' | 'C',
                skillDivisionTypeId: draft.skillDivisionTypeId,
                ageDivisionTypeId: draft.ageDivisionTypeId,
                price: Math.round(draft.priceDollars * 100),
                maxParticipants: draft.maxParticipants,
                description: draft.description,
                registrationUrl: draft.registrationUrl,
                status: 'ACTIVE',
            });
            onCreated(division);
            onClose();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Unable to create organization division.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal opened={opened} onClose={onClose} title="Create organization division" centered>
            <Stack gap="sm">
                <Select
                    label="Sport"
                    data={sportOptions}
                    value={draft.sportId}
                    onChange={(value) => {
                        const sportId = value ?? '';
                        const firstSkill = (divisionTypes.sportSkills ?? [])
                            .find((entry) => entry.sportId === sportId)
                            ?.skills[0]?.id ?? '';
                        setDraft((current) => ({ ...current, sportId, skillDivisionTypeId: firstSkill }));
                    }}
                    required
                    searchable
                />
                <Group grow align="flex-start">
                    <Select
                        label="Gender"
                        data={genderOptions}
                        value={draft.gender}
                        onChange={(value) => setDraft((current) => ({ ...current, gender: value ?? 'C' }))}
                        required
                    />
                    <Select
                        label="Age"
                        data={ageOptions}
                        value={draft.ageDivisionTypeId}
                        onChange={(value) => setDraft((current) => ({ ...current, ageDivisionTypeId: value ?? '' }))}
                        required
                        searchable
                    />
                </Group>
                <Select
                    label="Filter skill level"
                    description="Choose a standard skill level used by Discover filters."
                    data={skillOptions}
                    value={draft.skillDivisionTypeId}
                    onChange={(value) => setDraft((current) => ({ ...current, skillDivisionTypeId: value ?? '' }))}
                    required
                    searchable
                />
                <TextInput
                    label="Division name"
                    description="Use the club's custom division or team name, or leave blank to generate one."
                    value={draft.name}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.currentTarget.value }))}
                />
                <Group grow align="flex-start">
                    <NumberInput
                        label="Division season price"
                        description="Total per-player price for the club season."
                        prefix="$"
                        decimalScale={2}
                        min={0}
                        value={draft.priceDollars}
                        onChange={(value) => setDraft((current) => ({
                            ...current,
                            priceDollars: Number(value) || 0,
                        }))}
                    />
                    <NumberInput
                        label="Season capacity"
                        description="Optional"
                        min={1}
                        value={draft.maxParticipants ?? ''}
                        onChange={(value) => setDraft((current) => ({
                            ...current,
                            maxParticipants: value === '' ? null : Number(value),
                        }))}
                    />
                </Group>
                <Textarea
                    label="Description"
                    autosize
                    minRows={3}
                    value={draft.description}
                    onChange={(event) => setDraft((current) => ({ ...current, description: event.currentTarget.value }))}
                />
                <TextInput
                    label="Registration URL"
                    type="url"
                    value={draft.registrationUrl}
                    onChange={(event) => setDraft((current) => ({ ...current, registrationUrl: event.currentTarget.value }))}
                />
                {error ? <Alert color="red">{error}</Alert> : null}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>Cancel</Button>
                    <Button loading={saving} disabled={!canSave} onClick={() => void save()}>
                        Create division
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

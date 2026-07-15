import { useEffect, useMemo, useState } from 'react';
import {
    ActionIcon,
    Alert,
    Button,
    Group,
    Loader,
    MultiSelect,
    NumberInput,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { Plus, X } from 'lucide-react';

import { useSports } from '@/app/hooks/useSports';
import { organizationService } from '@/lib/organizationService';
import type { Division } from '@/types';

import type { DivisionDetailForm } from '../divisionForm';
import {
    OrganizationDivisionCreateModal,
    type OrganizationDivisionTypePayload,
} from './OrganizationDivisionCreateModal';

type Props = {
    organizationId?: string;
    preferredSportId?: string;
    selectedDivisions: DivisionDetailForm[];
    maxPriceCents: number;
    disabled?: boolean;
    onChange: (divisions: Division[]) => void;
    onTryoutPriceChange: (sourceDivisionId: string, price: number) => void;
    validationMessage?: string;
};

const formatPrice = (price?: number): string => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
}).format(Math.max(0, price ?? 0) / 100);

export const TryoutDivisionSelector = ({
    organizationId,
    preferredSportId,
    selectedDivisions,
    maxPriceCents,
    disabled = false,
    onChange,
    onTryoutPriceChange,
    validationMessage,
}: Props) => {
    const { sports } = useSports();
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [divisionTypes, setDivisionTypes] = useState<OrganizationDivisionTypePayload>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [createOpened, setCreateOpened] = useState(false);

    const selectedSourceDivisionIds = useMemo(
        () => selectedDivisions
            .map((division) => division.sourceDivisionId)
            .filter((divisionId): divisionId is string => Boolean(divisionId)),
        [selectedDivisions],
    );

    useEffect(() => {
        if (!organizationId) {
            setDivisions([]);
            setError(null);
            return;
        }
        let active = true;
        setLoading(true);
        setError(null);
        Promise.all([
            organizationService.listOrganizationDivisions(organizationId, true),
            fetch('/api/division-types').then((response) => {
                if (!response.ok) throw new Error('Failed to load division options.');
                return response.json() as Promise<OrganizationDivisionTypePayload>;
            }),
        ])
            .then(([rows, nextDivisionTypes]) => {
                if (!active) return;
                setDivisions(rows);
                setDivisionTypes(nextDivisionTypes);
            })
            .catch((loadError) => {
                if (!active) return;
                setError(loadError instanceof Error ? loadError.message : 'Unable to load club divisions.');
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [organizationId]);

    const activeDivisions = useMemo(
        () => divisions.filter((division) => division.status === 'ACTIVE' || selectedSourceDivisionIds.includes(division.id)),
        [divisions, selectedSourceDivisionIds],
    );
    const selectedOrganizationDivisions = useMemo(
        () => selectedSourceDivisionIds
            .map((id) => divisions.find((division) => division.id === id))
            .filter((division): division is Division => Boolean(division)),
        [divisions, selectedSourceDivisionIds],
    );
    const selectedDetailBySourceId = useMemo(
        () => new Map(selectedDivisions
            .filter((division) => Boolean(division.sourceDivisionId))
            .map((division) => [division.sourceDivisionId as string, division] as const)),
        [selectedDivisions],
    );
    const options = activeDivisions.map((division) => ({
        value: division.id,
        label: division.name,
    }));
    const sportOptions = sports.map((sport) => ({ value: sport.$id, label: sport.name }));

    const labelFor = (optionsToSearch: Array<{ id: string; name: string }> | undefined, value?: string) => (
        optionsToSearch?.find((option) => option.id === value)?.name ?? value ?? 'Not specified'
    );
    const genderLabel = (value?: string) => labelFor(divisionTypes.genders, value);
    const ageLabel = (value?: string) => labelFor(divisionTypes.ages, value);
    const skillLabel = (division: Division) => labelFor(
        divisionTypes.sportSkills?.find((entry) => entry.sportId === division.sportId)?.skills,
        division.skillDivisionTypeId,
    );
    const sportLabel = (sportId?: string) => (
        sportOptions.find((option) => option.value === sportId)?.label ?? sportId ?? 'Not specified'
    );

    if (!organizationId) {
        return <Alert color="yellow">Select an organization before choosing tryout divisions.</Alert>;
    }

    return (
        <Stack gap="xs">
            <Group justify="space-between" align="flex-end">
                <div>
                    <Text fw={600} size="sm">Organization divisions</Text>
                    <Text size="xs" c="dimmed">
                        Select every club division participating in this tryout.
                    </Text>
                </div>
                <Button
                    size="xs"
                    variant="light"
                    leftSection={<Plus size={14} />}
                    disabled={disabled || loading}
                    onClick={() => setCreateOpened(true)}
                >
                    Create division
                </Button>
            </Group>
            <MultiSelect
                label="Divisions in this tryout"
                description="You can select multiple divisions. Organization settings remain unchanged."
                placeholder={loading ? 'Loading club divisions...' : 'Select one or more divisions'}
                data={options}
                value={selectedSourceDivisionIds}
                searchable
                clearable
                disabled={disabled || loading}
                rightSection={loading ? <Loader size="xs" /> : undefined}
                onChange={(ids) => {
                    const selected = ids
                        .map((id) => activeDivisions.find((division) => division.id === id))
                        .filter((division): division is Division => Boolean(division));
                    onChange(selected);
                }}
            />
            {error ? <Alert color="red">{error}</Alert> : null}
            {!loading && !error && activeDivisions.length === 0 ? (
                <Alert color="yellow">
                    <Stack gap="xs">
                        <Text size="sm">
                            This organization has no active divisions. Create an organization division before configuring the tryout.
                        </Text>
                        <Button
                            size="xs"
                            variant="light"
                            leftSection={<Plus size={14} />}
                            disabled={disabled}
                            onClick={() => setCreateOpened(true)}
                        >
                            Create organization division
                        </Button>
                    </Stack>
                </Alert>
            ) : null}
            {validationMessage ? <Alert color="red">{validationMessage}</Alert> : null}
            {selectedOrganizationDivisions.length > 0 ? (
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                    {selectedOrganizationDivisions.map((division) => {
                        const detail = selectedDetailBySourceId.get(division.id);
                        return (
                            <Paper key={division.id} withBorder radius="sm" p="sm">
                                <Stack gap="xs">
                                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                                        <div>
                                            <Text fw={700} size="sm">{division.name}</Text>
                                            <Text size="xs" c="dimmed">{sportLabel(division.sportId)}</Text>
                                        </div>
                                        <Tooltip label={`Remove ${division.name}`}>
                                            <ActionIcon
                                                variant="subtle"
                                                color="red"
                                                disabled={disabled}
                                                aria-label={`Remove ${division.name}`}
                                                onClick={() => onChange(selectedOrganizationDivisions.filter((row) => row.id !== division.id))}
                                            >
                                                <X size={16} />
                                            </ActionIcon>
                                        </Tooltip>
                                    </Group>
                                    <SimpleGrid cols={3} spacing="xs">
                                        <div>
                                            <Text size="xs" c="dimmed">Gender</Text>
                                            <Text size="sm">{genderLabel(division.gender)}</Text>
                                        </div>
                                        <div>
                                            <Text size="xs" c="dimmed">Age</Text>
                                            <Text size="sm">{ageLabel(division.ageDivisionTypeId)}</Text>
                                        </div>
                                        <div>
                                            <Text size="xs" c="dimmed">Skill</Text>
                                            <Text size="sm">{skillLabel(division)}</Text>
                                        </div>
                                    </SimpleGrid>
                                    <Group grow align="flex-start">
                                        <div>
                                            <Text size="xs" c="dimmed">Division season price</Text>
                                            <Text size="sm">{formatPrice(division.price)}</Text>
                                        </div>
                                        <div>
                                            <Text size="xs" c="dimmed">Season capacity</Text>
                                            <Text size="sm">{division.maxParticipants ?? 'Not specified'}</Text>
                                        </div>
                                    </Group>
                                    <NumberInput
                                        label="Tryout price"
                                        aria-label={`Tryout price for ${division.name}`}
                                        description="Per-player fee for this tryout only."
                                        prefix="$"
                                        decimalScale={2}
                                        min={0}
                                        max={maxPriceCents / 100}
                                        value={(detail?.price ?? 0) / 100}
                                        disabled={disabled}
                                        onChange={(value) => onTryoutPriceChange(
                                            division.id,
                                            Math.max(0, Math.round((Number(value) || 0) * 100)),
                                        )}
                                    />
                                    <Text size="xs" c="dimmed">
                                        Name, sport, gender, age, skill, season price, and season capacity come from the organization division and are read only here.
                                    </Text>
                                </Stack>
                            </Paper>
                        );
                    })}
                </SimpleGrid>
            ) : null}
            <Text size="xs" c="dimmed">
                Existing tryouts keep a snapshot of these settings even if the club division changes later.
            </Text>
            <OrganizationDivisionCreateModal
                opened={createOpened}
                organizationId={organizationId}
                preferredSportId={preferredSportId}
                sportOptions={sportOptions}
                divisionTypes={divisionTypes}
                onClose={() => setCreateOpened(false)}
                onCreated={(division) => {
                    setDivisions((current) => [...current.filter((row) => row.id !== division.id), division]);
                    const currentSelection = selectedOrganizationDivisions.filter((row) => row.id !== division.id);
                    onChange([...currentSelection, division]);
                }}
            />
        </Stack>
    );
};

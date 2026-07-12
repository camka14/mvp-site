import { useEffect, useMemo, useState } from 'react';
import { Alert, Loader, MultiSelect, Stack, Text } from '@mantine/core';

import { organizationService } from '@/lib/organizationService';
import type { Division } from '@/types';

type Props = {
    organizationId?: string;
    selectedSourceDivisionIds: string[];
    disabled?: boolean;
    onChange: (divisions: Division[]) => void;
};

export const TryoutDivisionSelector = ({
    organizationId,
    selectedSourceDivisionIds,
    disabled = false,
    onChange,
}: Props) => {
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!organizationId) {
            setDivisions([]);
            setError(null);
            return;
        }
        let active = true;
        setLoading(true);
        setError(null);
        organizationService.listOrganizationDivisions(organizationId, true)
            .then((rows) => {
                if (!active) return;
                setDivisions(rows.filter((division) => division.status !== 'ARCHIVED'));
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
    const options = activeDivisions.map((division) => ({
        value: division.id,
        label: division.name,
    }));

    if (!organizationId) {
        return <Alert color="yellow">Select an organization before choosing tryout divisions.</Alert>;
    }

    return (
        <Stack gap="xs">
            <MultiSelect
                label="Club divisions in this tryout"
                description="Each selected division gets its own tryout fee, capacity, resource, and session schedule."
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
                    This organization has no active club divisions. Add divisions on the organization page first.
                </Alert>
            ) : null}
            <Text size="xs" c="dimmed">
                Existing tryouts keep a snapshot of these settings even if the club division changes later.
            </Text>
        </Stack>
    );
};

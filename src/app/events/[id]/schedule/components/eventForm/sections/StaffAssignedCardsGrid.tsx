import type { ComponentProps } from 'react';
import { SimpleGrid } from '@mantine/core';

import { StaffAssignedHostsList } from './StaffAssignedHostsList';
import { StaffAssignedOfficialsList } from './StaffAssignedOfficialsList';

type StaffAssignedCardsGridProps = {
    officialsListProps: ComponentProps<typeof StaffAssignedOfficialsList>;
    hostsListProps: ComponentProps<typeof StaffAssignedHostsList>;
};

export const StaffAssignedCardsGrid = ({
    officialsListProps,
    hostsListProps,
}: StaffAssignedCardsGridProps) => (
    <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        <StaffAssignedOfficialsList {...officialsListProps} />
        <StaffAssignedHostsList {...hostsListProps} />
    </SimpleGrid>
);

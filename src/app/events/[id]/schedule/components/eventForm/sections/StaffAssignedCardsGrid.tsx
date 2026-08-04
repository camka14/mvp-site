import type { ComponentProps } from 'react';
import { SimpleGrid } from '@mantine/core';

import { StaffAssignedHostsList } from './StaffAssignedHostsList';
import { StaffAssignedOfficialsList } from './StaffAssignedOfficialsList';

type StaffAssignedCardsGridProps = {
    officialsListProps: ComponentProps<typeof StaffAssignedOfficialsList>;
    hostsListProps: ComponentProps<typeof StaffAssignedHostsList>;
    showOfficials?: boolean;
    showHosts?: boolean;
};

export const StaffAssignedCardsGrid = ({
    officialsListProps,
    hostsListProps,
    showOfficials = true,
    showHosts = true,
}: StaffAssignedCardsGridProps) => (
    <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        {showOfficials ? <StaffAssignedOfficialsList {...officialsListProps} /> : null}
        {showHosts ? <StaffAssignedHostsList {...hostsListProps} /> : null}
    </SimpleGrid>
);

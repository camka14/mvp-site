import type { ReactNode } from 'react';
import { Alert } from '@mantine/core';

import {
    SectionNavigation,
    type SectionNavigationItem,
} from './SectionNavigation';

type EventFormShellProps = {
    formId?: string;
    sectionNavItems: SectionNavigationItem[];
    activeSectionId: string;
    mobileEditUnsupportedWarning?: string | null;
    leagueWarning?: string | null;
    leagueError?: string | null;
    onSelectSection: (sectionId: string) => void;
    children: ReactNode;
};

export const EventFormShell = ({
    formId,
    sectionNavItems,
    activeSectionId,
    mobileEditUnsupportedWarning,
    leagueWarning,
    leagueError,
    onSelectSection,
    children,
}: EventFormShellProps) => (
    <div className="w-full space-y-6">
        <div className="p-4">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
                <SectionNavigation
                    items={sectionNavItems}
                    activeSectionId={activeSectionId}
                    variant="desktop"
                    onSelectSection={onSelectSection}
                />

                <div className="min-w-0">
                    <SectionNavigation
                        items={sectionNavItems}
                        activeSectionId={activeSectionId}
                        variant="mobile"
                        onSelectSection={onSelectSection}
                    />
                    <div className="w-full">
                        <form id={formId} className="space-y-8">
                            {mobileEditUnsupportedWarning && (
                                <Alert color="yellow" variant="light" radius="md">
                                    {mobileEditUnsupportedWarning}
                                </Alert>
                            )}
                            {children}
                        </form>
                    </div>

                    <div className="border-t p-6 flex justify-between items-center">
                        <div className="flex flex-col gap-3">
                            {leagueWarning && (
                                <Alert color="yellow" radius="md">
                                    {leagueWarning}
                                </Alert>
                            )}
                            {leagueError && (
                                <Alert color="red" radius="md">
                                    {leagueError}
                                </Alert>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
);

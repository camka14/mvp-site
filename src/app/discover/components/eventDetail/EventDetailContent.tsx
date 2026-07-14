import type { ComponentProps, RefObject } from 'react';
import { ActionIcon } from '@mantine/core';

import { EventDetailHero } from './EventDetailHero';
import { EventDetailSheetSummary } from './EventDetailSheetSummary';
import { EventJoinCard } from './EventJoinCard';
import { EventParticipantsSection } from './EventParticipantsSection';
import { PublicEventOverview } from './PublicEventOverview';
import { PublicEventProgramDetails } from './PublicEventProgramDetails';

type EventDetailContentProps = {
    renderInline: boolean;
    onClose: () => void;
    sheetPopoverZIndex: number;
    heroProps: ComponentProps<typeof EventDetailHero>;
    overviewProps: ComponentProps<typeof PublicEventOverview>;
    programDetailsProps: ComponentProps<typeof PublicEventProgramDetails>;
    summaryProps: ComponentProps<typeof EventDetailSheetSummary>;
    showParticipantsSection: boolean;
    participantsProps: ComponentProps<typeof EventParticipantsSection>;
    joinCardProps: ComponentProps<typeof EventJoinCard>;
    joinCardAnchorRef: RefObject<HTMLDivElement | null>;
    joinCardRef: RefObject<HTMLDivElement | null>;
    joinCardDocked: boolean;
    joinCardHeight: number;
    joinCardLeft: number;
    joinCardWidth: number;
};

export function EventDetailContent({
    renderInline,
    onClose,
    sheetPopoverZIndex,
    heroProps,
    overviewProps,
    programDetailsProps,
    summaryProps,
    showParticipantsSection,
    participantsProps,
    joinCardProps,
    joinCardAnchorRef,
    joinCardRef,
    joinCardDocked,
    joinCardHeight,
    joinCardLeft,
    joinCardWidth,
}: EventDetailContentProps) {
    const joinCardFrameClassName = renderInline
        ? `fixed inset-x-0 bottom-0 z-50 max-h-[82vh] overflow-y-auto px-4 pb-4 pt-3 lg:inset-auto lg:p-0 ${
            joinCardDocked
                ? 'lg:fixed lg:bottom-24 lg:z-30 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto'
                : 'lg:static lg:max-h-none lg:overflow-visible'
        }`
        : undefined;

    return (
        <div className={`space-y-6 ${renderInline ? 'pb-24 lg:pb-0' : ''}`}>
            {!renderInline ? (
                <div
                    style={{
                        position: 'sticky',
                        top: 12,
                        display: 'flex',
                        justifyContent: 'flex-end',
                        zIndex: sheetPopoverZIndex + 20,
                    }}
                >
                    <ActionIcon
                        variant="filled"
                        color="gray"
                        radius="xl"
                        aria-label="Close"
                        onClick={onClose}
                        style={{ boxShadow: 'var(--mvp-shadow-overlay)' }}
                    >
                        ×
                    </ActionIcon>
                </div>
            ) : null}

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <EventDetailHero {...heroProps} />

                <div className="bg-white p-5 sm:p-7">
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
                        <div className="space-y-6">
                            {renderInline ? (
                                <div className="space-y-5">
                                    <PublicEventOverview {...overviewProps} />
                                    <PublicEventProgramDetails {...programDetailsProps} />
                                </div>
                            ) : (
                                <EventDetailSheetSummary {...summaryProps} />
                            )}
                        </div>

                        <div className="space-y-6 lg:self-start">
                            {showParticipantsSection ? (
                                <EventParticipantsSection {...participantsProps} />
                            ) : null}

                            <div
                                ref={joinCardAnchorRef}
                                style={joinCardDocked ? { height: joinCardHeight } : undefined}
                            >
                                <div
                                    ref={joinCardRef}
                                    className={joinCardFrameClassName}
                                    style={joinCardDocked
                                        ? {
                                            left: joinCardLeft,
                                            width: joinCardWidth || undefined,
                                        }
                                        : undefined}
                                >
                                    <EventJoinCard {...joinCardProps} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

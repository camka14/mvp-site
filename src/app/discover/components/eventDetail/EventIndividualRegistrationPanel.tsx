import type { ReactNode } from 'react';
import { Alert, Button, Text } from '@mantine/core';

import { formatPrice } from '@/types';

type EventIndividualRegistrationPanelProps = {
    selfRegistrationBlockedReason: string | null;
    isMinor: boolean;
    showSelfWaitlistActions: boolean;
    isUserWaitlisted: boolean;
    selfWaitlistLeaveDisabled: boolean;
    selfWaitlistJoinDisabled: boolean;
    selfJoinDisabled: boolean;
    eventHasStarted: boolean;
    joining: boolean;
    confirmingPurchase: boolean;
    priceCents: number;
    currentUserPaymentFailed: boolean;
    canShowScheduleButton: boolean;
    hostManageQrActions: ReactNode;
    childRegistrationPanel: ReactNode;
    onLeaveWaitlist: () => void;
    onJoinWaitlist: () => void;
    onJoinEvent: () => void;
};

export function EventIndividualRegistrationPanel({
    selfRegistrationBlockedReason,
    isMinor,
    showSelfWaitlistActions,
    isUserWaitlisted,
    selfWaitlistLeaveDisabled,
    selfWaitlistJoinDisabled,
    selfJoinDisabled,
    eventHasStarted,
    joining,
    confirmingPurchase,
    priceCents,
    currentUserPaymentFailed,
    canShowScheduleButton,
    hostManageQrActions,
    childRegistrationPanel,
    onLeaveWaitlist,
    onJoinWaitlist,
    onJoinEvent,
}: EventIndividualRegistrationPanelProps) {
    return (
        <div className="space-y-3">
            {selfRegistrationBlockedReason ? (
                <Alert color="yellow" variant="light">
                    {selfRegistrationBlockedReason}
                </Alert>
            ) : null}
            {!selfRegistrationBlockedReason && isMinor ? (
                <Alert color="blue" variant="light">
                    Your join request will be sent to a linked parent/guardian for approval.
                </Alert>
            ) : null}

            {showSelfWaitlistActions ? (
                isUserWaitlisted ? (
                    <div className="space-y-2">
                        <Text size="sm" c="blue" fw={500} ta="center">
                            {"✓ You're on the waitlist"}
                        </Text>
                        <Button
                            fullWidth
                            color="red"
                            variant="light"
                            onClick={onLeaveWaitlist}
                            disabled={selfWaitlistLeaveDisabled}
                        >
                            {eventHasStarted
                                ? 'Unavailable'
                                : (joining ? 'Updating…' : 'Leave Waitlist')}
                        </Button>
                    </div>
                ) : (
                    <Button
                        fullWidth
                        color="orange"
                        onClick={onJoinWaitlist}
                        disabled={selfWaitlistJoinDisabled}
                    >
                        {eventHasStarted
                            ? 'Unavailable'
                            : joining
                                ? (isMinor ? 'Sending…' : 'Adding…')
                                : (isMinor ? 'Send' : 'Join Waitlist')}
                    </Button>
                )
            ) : (
                <Button
                    fullWidth
                    color="blue"
                    onClick={onJoinEvent}
                    disabled={selfJoinDisabled}
                >
                    {eventHasStarted
                        ? 'Unavailable'
                        : confirmingPurchase
                            ? 'Confirming purchase…'
                            : joining
                                ? 'Submitting…'
                                : isMinor
                                    ? 'Send'
                                    : priceCents > 0
                                        ? (currentUserPaymentFailed
                                            ? 'Complete payment'
                                            : `Join Event - ${formatPrice(priceCents)}`)
                                        : 'Join Event'}
                </Button>
            )}

            {canShowScheduleButton ? (
                <div className="mt-2">{hostManageQrActions}</div>
            ) : null}

            {childRegistrationPanel}
        </div>
    );
}

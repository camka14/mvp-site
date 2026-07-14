import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { eventService, type WeeklyOccurrenceSelection } from '@/lib/eventService';
import type { Event, UserData } from '@/types';

type RegistrationConfirmationOptions = {
    pendingPayment?: boolean;
};

type UseRegistrationConfirmationControllerArgs = {
    event: Event | null;
    user: UserData | null | undefined;
    selectedTeamId: string;
    occurrence?: WeeklyOccurrenceSelection;
    reload: () => void | Promise<void>;
    navigateToCompletion: () => void;
    setConfirming: (opened: boolean) => void;
    setJoinError: Dispatch<SetStateAction<string | null>>;
    setJoinNotice: Dispatch<SetStateAction<string | null>>;
    timeoutMs?: number;
    pollIntervalMs?: number;
};

type ParticipantTeam = {
    $id?: unknown;
    id?: unknown;
    parentTeamId?: unknown;
};

function normalizeIds(values: unknown): string[] {
    if (!Array.isArray(values)) {
        return [];
    }
    return Array.from(new Set(values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value): value is string => value.length > 0)));
}

export function isTargetTeamInParticipantSnapshot({
    targetTeamId,
    teamIds,
    teams,
}: {
    targetTeamId: string | null;
    teamIds: unknown;
    teams: unknown;
}): boolean {
    if (!targetTeamId) {
        return false;
    }
    if (normalizeIds(teamIds).includes(targetTeamId)) {
        return true;
    }
    return Array.isArray(teams) && teams.some((team) => {
        const teamRecord = team as ParticipantTeam;
        const eventTeamId = typeof teamRecord.$id === 'string'
            ? teamRecord.$id.trim()
            : typeof teamRecord.id === 'string'
                ? teamRecord.id.trim()
                : '';
        const parentTeamId = typeof teamRecord.parentTeamId === 'string'
            ? teamRecord.parentTeamId.trim()
            : '';
        return eventTeamId === targetTeamId || parentTeamId === targetTeamId;
    });
}

export function useRegistrationConfirmationController({
    event,
    user,
    selectedTeamId,
    occurrence,
    reload,
    navigateToCompletion,
    setConfirming,
    setJoinError,
    setJoinNotice,
    timeoutMs = 30_000,
    pollIntervalMs = 2_000,
}: UseRegistrationConfirmationControllerArgs) {
    const requestGenerationRef = useRef(0);

    useEffect(() => {
        requestGenerationRef.current += 1;
        return () => {
            requestGenerationRef.current += 1;
        };
    }, [event?.$id, occurrence?.occurrenceDate, occurrence?.slotId]);

    const confirmRegistrationAfterPayment = useCallback(async ({
        pendingPayment = false,
    }: RegistrationConfirmationOptions = {}) => {
        if (!user || !event) {
            return;
        }
        const requestGeneration = ++requestGenerationRef.current;
        const isCurrentRequest = () => requestGenerationRef.current === requestGeneration;
        setConfirming(true);
        setJoinError(null);

        const deadline = Date.now() + timeoutMs;
        const targetTeamId = selectedTeamId || null;

        try {
            if (event.teamSignup && !targetTeamId) {
                throw new Error('Team is required to complete registration.');
            }

            while (Date.now() < deadline && isCurrentRequest()) {
                let registered = false;
                if (occurrence) {
                    const snapshot = await eventService.getEventParticipants(event.$id, occurrence);
                    if (!isCurrentRequest()) {
                        return;
                    }
                    registered = event.teamSignup
                        ? isTargetTeamInParticipantSnapshot({
                            targetTeamId,
                            teamIds: snapshot.participants.teamIds,
                            teams: snapshot.teams,
                        })
                        : normalizeIds(snapshot.participants.userIds).includes(user.$id);
                } else {
                    const latest = await eventService.getEventWithRelations(event.$id);
                    if (!isCurrentRequest()) {
                        return;
                    }
                    if (latest) {
                        registered = latest.teamSignup
                            ? (
                                targetTeamId
                                    ? Object.values(latest.teams || {}).some((team) => (
                                        team.parentTeamId === targetTeamId || team.$id === targetTeamId
                                    ))
                                    : Object.values(latest.teams || {}).some((team) => (
                                        (team.playerIds || []).includes(user.$id)
                                    ))
                            )
                            : (latest.players || []).some((player) => player.$id === user.$id);
                    }
                }

                if (registered) {
                    await reload();
                    if (!isCurrentRequest()) {
                        return;
                    }
                    if (pendingPayment) {
                        setJoinNotice('Payment submitted. Your registration is pending until the bank payment clears.');
                        return;
                    }
                    navigateToCompletion();
                    return;
                }

                await new Promise<void>((resolve) => {
                    window.setTimeout(resolve, pollIntervalMs);
                });
            }

            if (!isCurrentRequest()) {
                return;
            }
            if (pendingPayment) {
                await reload();
                if (isCurrentRequest()) {
                    setJoinNotice('Payment submitted. Your registration is pending until the bank payment clears.');
                }
            } else {
                setJoinError('Timed out');
            }
        } catch (error) {
            if (isCurrentRequest()) {
                setJoinError(error instanceof Error ? error.message : 'Error confirming purchase.');
            }
        } finally {
            if (isCurrentRequest()) {
                setConfirming(false);
            }
        }
    }, [
        event,
        navigateToCompletion,
        occurrence,
        pollIntervalMs,
        reload,
        selectedTeamId,
        setConfirming,
        setJoinError,
        setJoinNotice,
        timeoutMs,
        user,
    ]);

    return {
        confirmRegistrationAfterPayment,
    };
}

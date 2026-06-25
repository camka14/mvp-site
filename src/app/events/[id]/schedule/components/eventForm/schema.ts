import { z } from 'zod';

import type { LeagueSlotForm } from '@/app/discover/components/LeagueFields';
import { parseLocalDateTime } from '@/lib/dateUtils';
import type { Field } from '@/types';

import { requiresOrganizationEventFieldSelection } from '../eventFieldSelection';
import {
    buildSlotDivisionLookup,
    normalizeDivisionKeys,
    normalizePlayoffDivisionParticipantCount,
    normalizeSlotDivisionKeysWithLookup,
} from './divisionForm';
import { isTournamentPoolPlayFormEnabled, supportsScheduleSlotsForEvent } from './eventRules';
import { coordinatesAreSet } from './locationHelpers';
import { isEventLocalField } from './resourceGroups';
import { stringSetsEqual } from './shared';
import { normalizeSlotFieldIds, normalizeWeekdays } from './slotForm';
import { computeSlotError } from './slotValidation';

const leagueSlotSchema: z.ZodType<LeagueSlotForm> = z.object({
    key: z.string(),
    $id: z.string().optional(),
    scheduledFieldId: z.string().optional(),
    scheduledFieldIds: z.array(z.string()).default([]),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
    divisions: z.array(z.string()).default([]),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    timeZone: z.string().optional(),
    startTimeMinutes: z.number().int().nonnegative().optional(),
    endTimeMinutes: z.number().int().positive().optional(),
    price: z.number().int().nonnegative().optional(),
    sourceType: z.string().nullable().optional(),
    rentalBookingId: z.string().nullable().optional(),
    rentalBookingItemId: z.string().nullable().optional(),
    rentalLocked: z.boolean().optional(),
    requiredTemplateIds: z.array(z.string()).optional(),
    hostRequiredTemplateIds: z.array(z.string()).optional(),
    repeating: z.boolean().optional(),
    conflicts: z.array(z.any()).default([]),
    checking: z.boolean().default(false),
    error: z.string().optional(),
});

const RENTAL_SLOT_MISMATCH_ERROR_PREFIX = 'This rental resource is only available for ';

const matchRulesConfigSchema = z.object({
    scoringModel: z.enum(['SETS', 'PERIODS', 'INNINGS', 'POINTS_ONLY']).optional(),
    segmentLabel: z.string().trim().optional(),
    supportsDraw: z.boolean().optional(),
    supportsOvertime: z.boolean().optional(),
    supportsShootout: z.boolean().optional(),
    canUseOvertime: z.boolean().optional(),
    canUseShootout: z.boolean().optional(),
    officialRoles: z.array(z.string()).optional(),
    supportedIncidentTypes: z.array(z.string()).optional(),
    incidentTypeDefinitions: z.array(z.object({
        code: z.string().trim(),
        label: z.string().trim(),
        kind: z.enum(['SCORING', 'DISCIPLINE', 'NOTE', 'ADMIN']),
        cardColor: z.enum(['yellow', 'red', 'blue']).nullable().optional(),
        requiresTeam: z.boolean().optional(),
        requiresParticipant: z.boolean().optional(),
        defaultEnabled: z.boolean().optional(),
        linkedPointDelta: z.number().int().nullable().optional(),
        metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    })).optional(),
    autoCreatePointIncidentType: z.string().trim().optional(),
    timekeeping: z.object({
        timerMode: z.enum(['NONE', 'COUNT_UP']).optional(),
        segmentDurationMinutes: z.number().int().positive().nullable().optional(),
        segmentDurationMinutesBySequence: z.array(z.number().int().positive()).optional(),
        canUseAddedTime: z.boolean().optional(),
        addedTimeEnabled: z.boolean().optional(),
        stopAtRegulationEnd: z.boolean().optional(),
    }).optional(),
}).nullable().optional();

const tournamentConfigSchema = z.object({
    doubleElimination: z.boolean(),
    winnerSetCount: z.number().min(1),
    loserSetCount: z.number().min(1),
    winnerBracketPointsToVictory: z.array(z.number()),
    loserBracketPointsToVictory: z.array(z.number()),
    prize: z.string(),
    fieldCount: z.number().min(0),
    restTimeMinutes: z.number().min(0),
    usesSets: z.boolean().optional(),
    matchDurationMinutes: z.number().optional(),
    setDurationMinutes: z.number().optional(),
});

export type EventFormSchemaOptions = {
    allowMissingEventImage?: boolean;
    allowMissingEventDivisions?: boolean;
};

export const buildEventFormSchema = (options: EventFormSchemaOptions = {}) => z
    .object({
        $id: z.string(),
        name: z.string().trim().min(1, 'Event name is required'),
        description: z.string().default(''),
        affiliateUrl: z.string().trim().default(''),
        tags: z.array(z.object({
            id: z.string().optional(),
            $id: z.string().optional(),
            name: z.string().trim().min(1),
            slug: z.string().optional(),
        })).default([]),
        location: z.string().trim(),
        address: z.string().trim().default(''),
        coordinates: z.tuple([z.number(), z.number()]),
        start: z.string(),
        end: z
            .string()
            .nullable()
            .optional()
            .transform((value) => value ?? ''),
        timeZone: z.string().trim().default('UTC'),
        state: z.string().default('DRAFT'),
        eventType: z.enum(['EVENT', 'TOURNAMENT', 'LEAGUE', 'WEEKLY_EVENT', 'AFFILIATE']),
        parentEvent: z.string().optional().nullable(),
        sportId: z.string().trim(),
        sportConfig: z.any().nullable(),
        price: z.number().int().min(0, 'Price must be at least 0'),
        minAge: z.number().int().min(0).optional(),
        maxAge: z.number().int().min(0).optional(),
        allowPaymentPlans: z.boolean().default(false),
        installmentCount: z.number().int().min(0).default(0),
        installmentDueDates: z.array(z.string()).default([]),
        installmentDueRelativeDays: z.array(z.number().int()).default([]),
        installmentAmounts: z.array(z.number().int().min(0)).default([]),
        allowTeamSplitDefault: z.boolean().default(false),
        maxParticipants: z.number().min(2, 'Enter at least 2').nullable(),
        teamSizeLimit: z.number().min(1, 'Enter at least 1').nullable(),
        teamSignup: z.boolean(),
        singleDivision: z.boolean(),
        splitLeaguePlayoffDivisions: z.boolean().default(false),
        registrationByDivisionType: z.boolean().default(false),
        divisions: z.array(z.string()),
        divisionDetails: z.array(
            z.object({
                id: z.string().trim().min(1),
                key: z.string().trim().min(1),
                kind: z.enum(['LEAGUE', 'PLAYOFF']).optional(),
                name: z.string().trim().min(1),
                divisionTypeId: z.string().trim().min(1),
                divisionTypeName: z.string().trim().min(1),
                ratingType: z.enum(['AGE', 'SKILL']),
                gender: z.enum(['M', 'F', 'C']),
                skillDivisionTypeId: z.string().trim().min(1),
                skillDivisionTypeName: z.string().trim().min(1),
                ageDivisionTypeId: z.string().trim().min(1),
                ageDivisionTypeName: z.string().trim().min(1),
                price: z.number().int().min(0),
                maxParticipants: z.number().int().min(2),
                playoffTeamCount: z.number().optional(),
                poolCount: z.number().int().min(1).optional(),
                poolTeamCount: z.number().int().min(1).optional(),
                playoffPlacementDivisionIds: z.array(z.string()).optional(),
                gamesPerOpponent: z.number().min(1).optional(),
                restTimeMinutes: z.number().min(0).optional(),
                usesSets: z.boolean().optional(),
                matchDurationMinutes: z.number().optional(),
                setDurationMinutes: z.number().optional(),
                setsPerMatch: z.number().optional(),
                pointsToVictory: z.array(z.number()).optional(),
                playoffConfig: z.any().optional(),
                allowPaymentPlans: z.boolean().default(false),
                installmentCount: z.number().int().min(0).default(0),
                installmentDueDates: z.array(z.string()).default([]),
                installmentDueRelativeDays: z.array(z.number().int()).default([]),
                installmentAmounts: z.array(z.number().int().min(0)).default([]),
                sportId: z.string().optional(),
                fieldIds: z.array(z.string()).optional(),
                ageCutoffDate: z.string().optional(),
                ageCutoffLabel: z.string().optional(),
                ageCutoffSource: z.string().optional(),
            }),
        ).default([]),
        playoffDivisionDetails: z.array(
            z.object({
                id: z.string().trim().min(1),
                key: z.string().trim().min(1),
                kind: z.literal('PLAYOFF').default('PLAYOFF'),
                name: z.string().trim().min(1),
                maxParticipants: z.number().int().nullable(),
                playoffConfig: z.any(),
            }),
        ).default([]),
        divisionFieldIds: z.record(z.string(), z.array(z.string())).default({}),
        selectedFieldIds: z.array(z.string()).default([]),
        cancellationRefundHours: z.number().min(0).nullable(),
        registrationCutoffHours: z.number().min(0),
        organizationId: z.string().optional(),
        taxHandling: z.enum([
            'INHERIT_ORG',
            'STRIPE_TAX',
            'EXEMPT_PARTICIPANT_SPORTS',
            'ORGANIZER_MANUAL_TAX',
            'ORGANIZER_STRIPE_TAX',
        ]).default('INHERIT_ORG'),
        organizerManualTaxRateBps: z.number().int().min(0).max(2500).default(0),
        requiredTemplateIds: z.array(z.string()).default([]),
        hostId: z.string().optional(),
        noFixedEndDateTime: z.boolean().default(false),
        imageId: options.allowMissingEventImage
            ? z.string().trim().default('')
            : z.string().trim().min(1, 'Event image is required'),
        seedColor: z.number(),
        waitList: z.array(z.string()),
        freeAgents: z.array(z.string()),
        players: z.array(z.any()),
        teams: z.array(z.any()),
        officials: z.array(z.any()),
        officialIds: z.array(z.string()),
        officialSchedulingMode: z.enum(['STAFFING', 'TEAM_STAFFING', 'SCHEDULE', 'OFF']).default('SCHEDULE'),
        officialPositions: z.array(
            z.object({
                id: z.string().trim().min(1),
                name: z.string().trim().min(1),
                count: z.number().int().min(1),
                order: z.number().int().min(0),
            }),
        ).default([]),
        eventOfficials: z.array(
            z.object({
                id: z.string().trim().min(1),
                userId: z.string().trim().min(1),
                positionIds: z.array(z.string()).default([]),
                fieldIds: z.array(z.string()).default([]),
                isActive: z.boolean().optional(),
            }),
        ).default([]),
        pendingStaffInvites: z.array(
            z.object({
                firstName: z.string().default(''),
                lastName: z.string().default(''),
                email: z.string().default(''),
                roles: z.array(z.enum(['OFFICIAL', 'ASSISTANT_HOST'])).default([]),
            }),
        ).default([]),
        assistantHostIds: z.array(z.string()).default([]),
        doTeamsOfficiate: z.boolean(),
        teamOfficialsMaySwap: z.boolean().default(false),
        matchRulesOverride: matchRulesConfigSchema.default(null),
        autoCreatePointMatchIncidents: z.boolean().default(false),
        leagueScoringConfig: z.any(),
        leagueSlots: z.array(leagueSlotSchema),
        leagueData: z.object({
            gamesPerOpponent: z.number().min(1),
            includePlayoffs: z.boolean(),
            playoffTeamCount: z.number().optional(),
            usesSets: z.boolean().optional(),
            matchDurationMinutes: z.number().optional(),
            restTimeMinutes: z.number().min(0).optional(),
            setDurationMinutes: z.number().optional(),
            setsPerMatch: z.number().optional(),
            pointsToVictory: z.array(z.number()).optional(),
        }),
        playoffData: tournamentConfigSchema,
        tournamentData: tournamentConfigSchema,
        fields: z.array(z.any()),
        fieldCount: z.number().min(0),
        joinAsParticipant: z.boolean(),
    })
    .superRefine((values, ctx) => {
        if (values.singleDivision && values.maxParticipants == null) {
            ctx.addIssue({
                code: 'custom',
                message: values.teamSignup ? 'Max teams is required' : 'Max participants is required',
                path: ['maxParticipants'],
            });
        }

        if (values.teamSizeLimit == null) {
            ctx.addIssue({
                code: 'custom',
                message: 'Team size is required',
                path: ['teamSizeLimit'],
            });
        }

        if (!coordinatesAreSet(values.coordinates)) {
            ctx.addIssue({
                code: "custom",
                message: 'Select an event address from suggestions or the map',
                path: ['location'],
            });
        }

        const requiresDivisionSelection = !(options.allowMissingEventDivisions && values.eventType === 'EVENT')
            && values.eventType !== 'AFFILIATE';
        if (requiresDivisionSelection && values.divisions.length === 0) {
            ctx.addIssue({
                code: "custom",
                message: 'Select at least one division',
                path: ['divisions'],
            });
        }
        if (requiresDivisionSelection && values.divisionDetails.length === 0) {
            ctx.addIssue({
                code: "custom",
                message: 'Add at least one division',
                path: ['divisionDetails'],
            });
        }

        if (supportsScheduleSlotsForEvent(values.eventType, values.parentEvent) && !values.noFixedEndDateTime) {
            const parsedStart = parseLocalDateTime(values.start);
            const parsedEnd = parseLocalDateTime(values.end);
            if (!parsedStart || !parsedEnd || parsedEnd.getTime() <= parsedStart.getTime()) {
                ctx.addIssue({
                    code: "custom",
                    message: 'End date/time must be after start date/time when no fixed end datetime scheduling is disabled.',
                    path: ['end'],
                });
            }
        }

        const divisionIds = normalizeDivisionKeys(values.divisions);
        const detailIds = normalizeDivisionKeys(
            values.divisionDetails
                .map((detail) => detail?.id)
                .filter((value): value is string => typeof value === 'string'),
        );
        if (!stringSetsEqual(divisionIds, detailIds)) {
            ctx.addIssue({
                code: "custom",
                message: 'Division details are out of sync. Re-add the affected division.',
                path: ['divisionDetails'],
            });
        }
        if (requiresOrganizationEventFieldSelection(values.eventType, values.organizationId, values.selectedFieldIds)) {
            ctx.addIssue({
                code: "custom",
                message: 'Select at least one organization resource for this event.',
                path: ['selectedFieldIds'],
            });
        }
        const localFieldCount = values.fields.filter((field) => isEventLocalField(field as Field)).length;
        const selectedOrganizationFieldCount = values.selectedFieldIds.length;
        const scheduledFieldCount = Array.from(
            new Set(values.leagueSlots.flatMap((slot) => normalizeSlotFieldIds(slot))),
        ).length;
        const hasAtLeastOneField = selectedOrganizationFieldCount > 0
            || localFieldCount > 0
            || scheduledFieldCount > 0
            || values.fieldCount > 0;
        if ((values.eventType === 'EVENT' || values.eventType === 'WEEKLY_EVENT') && !hasAtLeastOneField) {
            ctx.addIssue({
                code: "custom",
                message: 'Select or create at least one resource for this event.',
                path: ['fieldCount'],
            });
        }
        if (values.eventType === 'AFFILIATE') {
            try {
                const url = new URL(values.affiliateUrl);
                if (!['http:', 'https:'].includes(url.protocol)) {
                    throw new Error('Invalid protocol');
                }
            } catch {
                ctx.addIssue({
                    code: "custom",
                    message: 'Enter a valid affiliate link.',
                    path: ['affiliateUrl'],
                });
            }
        }

        const usesRelativePaymentPlanDueDates = values.eventType === 'WEEKLY_EVENT' && !values.parentEvent;
        if (values.allowPaymentPlans) {
            const amounts = values.installmentAmounts || [];
            const dueDates = values.installmentDueDates || [];
            const relativeDueDays = values.installmentDueRelativeDays || [];
            if (values.installmentCount && amounts.length !== values.installmentCount) {
                ctx.addIssue({
                    code: "custom",
                    message: 'Installment count must match number of installments',
                    path: ['installmentCount'],
                });
            }
            if (!amounts.length) {
                ctx.addIssue({
                    code: "custom",
                    message: 'Add at least one installment amount',
                    path: ['installmentAmounts'],
                });
            }
            if (usesRelativePaymentPlanDueDates) {
                if (relativeDueDays.length !== amounts.length) {
                    ctx.addIssue({
                        code: "custom",
                        message: 'Each installment needs a due date offset',
                        path: ['installmentDueRelativeDays'],
                    });
                }
            } else if (dueDates.length && dueDates.length !== amounts.length) {
                ctx.addIssue({
                    code: "custom",
                    message: 'Each installment needs a due date',
                    path: ['installmentDueDates'],
                });
            }
        }

        if (!values.singleDivision) {
            values.divisionDetails.forEach((detail, index) => {
                if (!detail.allowPaymentPlans) {
                    return;
                }
                const amounts = Array.isArray(detail.installmentAmounts) ? detail.installmentAmounts : [];
                const dueDates = Array.isArray(detail.installmentDueDates) ? detail.installmentDueDates : [];
                const relativeDueDays = Array.isArray(detail.installmentDueRelativeDays)
                    ? detail.installmentDueRelativeDays
                    : [];
                const expectedCount = Number.isFinite(detail.installmentCount) ? detail.installmentCount : amounts.length;
                if (expectedCount > 0 && amounts.length !== expectedCount) {
                    ctx.addIssue({
                        code: 'custom',
                        message: 'Division installment count must match number of installments',
                        path: ['divisionDetails', index, 'installmentCount'],
                    });
                }
                if (!amounts.length) {
                    ctx.addIssue({
                        code: 'custom',
                        message: 'Add at least one division installment amount',
                        path: ['divisionDetails', index, 'installmentAmounts'],
                    });
                }
                if (usesRelativePaymentPlanDueDates) {
                    if (relativeDueDays.length !== amounts.length) {
                        ctx.addIssue({
                            code: 'custom',
                            message: 'Each division installment needs a due date offset',
                            path: ['divisionDetails', index, 'installmentDueRelativeDays'],
                        });
                    }
                } else if (dueDates.length && dueDates.length !== amounts.length) {
                    ctx.addIssue({
                        code: 'custom',
                        message: 'Each division installment needs a due date',
                        path: ['divisionDetails', index, 'installmentDueDates'],
                    });
                }
            });
        }

        if (typeof values.minAge === 'number' && typeof values.maxAge === 'number') {
            if (values.minAge > values.maxAge) {
                ctx.addIssue({
                    code: "custom",
                    message: 'Minimum age must be less than or equal to maximum age',
                    path: ['minAge'],
                });
            }
        }

        if (supportsScheduleSlotsForEvent(values.eventType, values.parentEvent)) {
            const slotDivisionLookup = buildSlotDivisionLookup(
                values.divisionDetails,
                values.eventType === 'LEAGUE' && values.leagueData.includePlayoffs && values.splitLeaguePlayoffDivisions
                    ? values.playoffDivisionDetails
                    : [],
            );
            const selectedDivisionKeys = slotDivisionLookup.keys;
            if (values.eventType === 'LEAGUE' && values.leagueData.includePlayoffs) {
                if (values.splitLeaguePlayoffDivisions) {
                    if (!values.playoffDivisionDetails.length) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Add at least one playoff division when split playoffs are enabled.',
                            path: ['playoffDivisionDetails'],
                        });
                    }

                    const playoffDivisionById = new Map(
                        values.playoffDivisionDetails.map((division) => [
                            normalizeDivisionKeys([division.id])[0],
                            division,
                        ]),
                    );
                    const mappingReferences = new Map<string, number>();

                    values.divisionDetails.forEach((detail, index) => {
                        if (!(typeof detail.playoffTeamCount === 'number' && detail.playoffTeamCount >= 2)) {
                            ctx.addIssue({
                                code: "custom",
                                message: 'Division playoff team count is required when playoffs are enabled',
                                path: ['divisionDetails', index, 'playoffTeamCount'],
                            });
                            return;
                        }

                        const mapping = Array.isArray(detail.playoffPlacementDivisionIds)
                            ? detail.playoffPlacementDivisionIds
                            : [];
                        for (let placementIndex = 0; placementIndex < detail.playoffTeamCount; placementIndex += 1) {
                            const mappedDivisionId = normalizeDivisionKeys([mapping[placementIndex]])[0];
                            if (!mappedDivisionId) {
                                ctx.addIssue({
                                    code: "custom",
                                    message: `Map placement ${placementIndex + 1} to a playoff division.`,
                                    path: ['divisionDetails', index, 'playoffPlacementDivisionIds', placementIndex],
                                });
                                continue;
                            }
                            if (!playoffDivisionById.has(mappedDivisionId)) {
                                ctx.addIssue({
                                    code: "custom",
                                    message: `Placement ${placementIndex + 1} references an invalid playoff division.`,
                                    path: ['divisionDetails', index, 'playoffPlacementDivisionIds', placementIndex],
                                });
                                continue;
                            }
                            mappingReferences.set(mappedDivisionId, (mappingReferences.get(mappedDivisionId) ?? 0) + 1);
                        }
                    });

                    values.playoffDivisionDetails.forEach((division, index) => {
                        const normalizedId = normalizeDivisionKeys([division.id])[0];
                        if (!normalizedId) {
                            return;
                        }
                        const assignedCount = mappingReferences.get(normalizedId) ?? 0;
                        const capacity = normalizePlayoffDivisionParticipantCount(division.maxParticipants);
                        if (typeof capacity !== 'number' || capacity < 2) {
                            ctx.addIssue({
                                code: "custom",
                                message: values.teamSignup
                                    ? 'Playoff division teams count must be at least 2.'
                                    : 'Playoff division participants count must be at least 2.',
                                path: ['playoffDivisionDetails', index, 'maxParticipants'],
                            });
                            return;
                        }
                        if (assignedCount > capacity) {
                            ctx.addIssue({
                                code: "custom",
                                message: `Playoff division "${division.name}" has ${assignedCount} mapped positions but only ${capacity} slots.`,
                                path: ['playoffDivisionDetails', index, 'maxParticipants'],
                            });
                        }
                    });
                } else if (values.singleDivision) {
                    if (!(typeof values.leagueData.playoffTeamCount === 'number' && values.leagueData.playoffTeamCount >= 2)) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Playoff team count is required when playoffs are enabled',
                            path: ['leagueData', 'playoffTeamCount'],
                        });
                    }
                } else {
                    values.divisionDetails.forEach((detail, index) => {
                        if (!(typeof detail.playoffTeamCount === 'number' && detail.playoffTeamCount >= 2)) {
                            ctx.addIssue({
                                code: "custom",
                                message: 'Division playoff team count is required when playoffs are enabled',
                                path: ['divisionDetails', index, 'playoffTeamCount'],
                            });
                        }
                    });
                }
            }

            if (isTournamentPoolPlayFormEnabled(values.eventType, values.leagueData.includePlayoffs)) {
                values.divisionDetails.forEach((detail, index) => {
                    const maxTeams = values.singleDivision
                        ? Math.max(2, Math.trunc(values.maxParticipants || detail.maxParticipants || 0))
                        : Math.max(2, Math.trunc(detail.maxParticipants || 0));
                    const poolCount = Number.isFinite(detail.poolCount)
                        ? Math.max(1, Math.trunc(detail.poolCount as number))
                        : null;
                    const bracketTeams = Number.isFinite(detail.playoffTeamCount)
                        ? Math.max(2, Math.trunc(detail.playoffTeamCount as number))
                        : null;
                    if (!poolCount) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Pool count is required when pool play is enabled.',
                            path: ['divisionDetails', index, 'poolCount'],
                        });
                        return;
                    }
                    if (!bracketTeams) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Bracket team count is required when pool play is enabled.',
                            path: ['divisionDetails', index, 'playoffTeamCount'],
                        });
                    }
                    if (maxTeams % poolCount !== 0) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Division max teams must divide evenly by pool count.',
                            path: ['divisionDetails', index, 'poolCount'],
                        });
                    }
                    if (bracketTeams && bracketTeams % poolCount !== 0) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Bracket team count must divide evenly by pool count.',
                            path: ['divisionDetails', index, 'playoffTeamCount'],
                        });
                    }
                });
            }

            if (!values.leagueSlots.length) {
                ctx.addIssue({
                    code: "custom",
                    message: 'Add at least one timeslot',
                    path: ['leagueSlots'],
                });
            }
            const coveredDivisionKeys = new Set<string>();
            values.leagueSlots.forEach((slot, index) => {
                if (!normalizeSlotFieldIds(slot).length) {
                    ctx.addIssue({
                        code: "custom",
                        message: 'Select at least one resource',
                        path: ['leagueSlots', index, 'scheduledFieldIds'],
                    });
                }
                if (slot.repeating === false) {
                    const slotStart = parseLocalDateTime(slot.startDate ?? null);
                    const slotEnd = parseLocalDateTime(slot.endDate ?? null);
                    if (!slotStart) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Select a start date/time',
                            path: ['leagueSlots', index, 'startDate'],
                        });
                    }
                    if (!slotEnd) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Select an end date/time',
                            path: ['leagueSlots', index, 'endDate'],
                        });
                    }
                    if (slotStart && slotEnd && slotEnd.getTime() <= slotStart.getTime()) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'End date/time must be after start date/time',
                            path: ['leagueSlots', index, 'endDate'],
                        });
                    }
                } else {
                    if (!normalizeWeekdays(slot).length) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Select at least one day',
                            path: ['leagueSlots', index, 'daysOfWeek'],
                        });
                    }
                    if (!Number.isFinite(slot.startTimeMinutes)) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Select a start time',
                            path: ['leagueSlots', index, 'startTimeMinutes'],
                        });
                    }
                    if (!Number.isFinite(slot.endTimeMinutes)) {
                        ctx.addIssue({
                            code: "custom",
                            message: 'Select an end time',
                            path: ['leagueSlots', index, 'endTimeMinutes'],
                        });
                    }
                }
                const normalizedSlotDivisionKeys = normalizeSlotDivisionKeysWithLookup(slot.divisions, slotDivisionLookup);
                if (!values.singleDivision && selectedDivisionKeys.length && !normalizedSlotDivisionKeys.length) {
                    ctx.addIssue({
                        code: "custom",
                        message: 'Select at least one division for this timeslot.',
                        path: ['leagueSlots', index, 'divisions'],
                    });
                }
                normalizedSlotDivisionKeys.forEach((divisionKey) => coveredDivisionKeys.add(divisionKey));
                if (
                    values.singleDivision &&
                    selectedDivisionKeys.length &&
                    !stringSetsEqual(
                        normalizedSlotDivisionKeys,
                        selectedDivisionKeys,
                    )
                ) {
                    ctx.addIssue({
                        code: "custom",
                        message: 'Single division requires every timeslot to include all selected divisions.',
                        path: ['leagueSlots', index, 'divisions'],
                    });
                }
                const error = computeSlotError(values.leagueSlots, index, values.eventType, values.parentEvent);
                if (error) {
                    ctx.addIssue({
                        code: "custom",
                        message: error,
                        path: ['leagueSlots', index, 'error'],
                    });
                }
                if (
                    typeof slot.error === 'string' &&
                    slot.error.trim().startsWith(RENTAL_SLOT_MISMATCH_ERROR_PREFIX)
                ) {
                    ctx.addIssue({
                        code: "custom",
                        message: slot.error,
                        path: ['leagueSlots', index, 'error'],
                    });
                }
            });
            selectedDivisionKeys.forEach((divisionKey) => {
                if (coveredDivisionKeys.has(divisionKey)) {
                    return;
                }
                const division = values.divisionDetails.find((detail) => (
                    normalizeDivisionKeys([detail.id, detail.key]).includes(divisionKey)
                ));
                ctx.addIssue({
                    code: "custom",
                    message: `${division?.name || 'Each division'} needs at least one timeslot.`,
                    path: ['leagueSlots'],
                });
            });
        }
    });

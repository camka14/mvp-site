import type { LeagueSlotForm } from '@/app/discover/components/LeagueFields';
import type { EventTaxHandling } from '@/lib/taxPolicy';
import type {
    Event,
    EventTag,
    EventOfficial,
    EventOfficialPosition,
    EventState,
    Field,
    LeagueConfig,
    LeagueScoringConfig,
    MatchRulesConfig,
    OfficialSchedulingMode,
    Sport,
    Team,
    TournamentConfig,
    UserData,
} from '@/types';

import type { DivisionDetailForm, PlayoffDivisionDetailForm } from './divisionForm';
import type { PendingStaffInvite } from './staffInvites';

export type EventFormState = {
    $id: string;
    name: string;
    description: string;
    isAffiliateEvent: boolean;
    affiliateUrl: string;
    registrationPaymentMode: 'ONLINE' | 'MANUAL';
    manualPaymentLinks: Event['manualPaymentLinks'];
    manualPaymentInstructions: string;
    tags: EventTag[];
    location: string;
    address: string;
    coordinates: [number, number];
    start: string;
    end: string;
    timeZone: string;
    state: EventState;
    eventType: Event['eventType'];
    parentEvent?: string;
    sportId: string;
    sportConfig: Sport | null;
    price: number;
    taxHandling: EventTaxHandling;
    organizerManualTaxRateBps: number;
    minAge?: number;
    maxAge?: number;
    allowPaymentPlans: boolean;
    installmentCount?: number;
    installmentDueDates: string[];
    installmentDueRelativeDays: number[];
    installmentAmounts: number[];
    allowTeamSplitDefault: boolean;
    maxParticipants: number | null;
    teamSizeLimit: number | null;
    teamSignup: boolean;
    singleDivision: boolean;
    splitLeaguePlayoffDivisions: boolean;
    registrationByDivisionType: boolean;
    divisions: string[];
    divisionDetails: DivisionDetailForm[];
    playoffDivisionDetails: PlayoffDivisionDetailForm[];
    divisionFieldIds: Record<string, string[]>;
    selectedFieldIds: string[];
    cancellationRefundHours: number | null;
    registrationCutoffHours: number;
    organizationId?: string;
    requiredTemplateIds: string[];
    hostId?: string;
    noFixedEndDateTime: boolean;
    imageId: string;
    seedColor: number;
    waitList: string[];
    freeAgents: string[];
    players: UserData[];
    teams: Team[];
    officials: UserData[];
    officialIds: string[];
    officialSchedulingMode: OfficialSchedulingMode;
    officialPositions: EventOfficialPosition[];
    eventOfficials: EventOfficial[];
    pendingStaffInvites: PendingStaffInvite[];
    assistantHostIds: string[];
    doTeamsOfficiate: boolean;
    teamOfficialsMaySwap: boolean;
    matchRulesOverride: MatchRulesConfig | null;
    autoCreatePointMatchIncidents: boolean;
    leagueScoringConfig: LeagueScoringConfig;
};

export type EventFormValues = EventFormState & {
    leagueSlots: LeagueSlotForm[];
    leagueData: LeagueConfig;
    playoffData: TournamentConfig;
    tournamentData: TournamentConfig;
    fields: Field[];
    fieldCount: number;
    joinAsParticipant: boolean;
};

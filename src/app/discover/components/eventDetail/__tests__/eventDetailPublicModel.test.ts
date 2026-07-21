import { buildEvent, buildTeam, buildTimeSlot, buildUser } from '../../../../../../test/factories';
import { buildDivisionOptionsForEvent } from '../divisionRegistration';
import { buildEventDetailPublicModel } from '../eventDetailPublicModel';

function buildModel(overrides: Partial<Parameters<typeof buildEventDetailPublicModel>[0]> = {}) {
    const event = overrides.event ?? buildEvent({
        start: '2099-08-01T19:00:00.000Z',
        end: '2099-08-01T21:00:00.000Z',
        teamSignup: false,
        price: 2500,
        divisions: ['division-open'],
        divisionDetails: [{ id: 'division-open', name: 'Open' }],
    });
    return buildEventDetailPublicModel({
        event,
        user: buildUser({ $id: 'viewer-one' }),
        hostUser: buildUser({ $id: event.hostId, firstName: 'Harper', lastName: 'Stone' }),
        teams: [],
        participantCapacity: 16,
        spotsLeft: 5,
        selectedDivisionBillingPriceCents: 2500,
        selectedDivisionOption: buildDivisionOptionsForEvent(event)[0] ?? null,
        divisionDisplayNameIndex: new Map([['division-open', 'Open']]),
        isEventHost: false,
        renderInline: true,
        isWeeklyParentEvent: false,
        now: new Date('2099-07-01T00:00:00.000Z'),
        ...overrides,
    });
}

describe('buildEventDetailPublicModel', () => {
    it('derives evergreen affiliate and organization presentation', () => {
        const event = buildEvent({
            dateDisplayMode: 'ONGOING',
            dateDisplayText: 'Drop in all summer',
            affiliateUrl: 'https://events.example.com/register',
            organizationId: 'org-river-city',
            organization: {
                $id: 'org-river-city',
                name: 'River City Sports Club',
            } as never,
            location: 'Riverside Courts',
        });

        const model = buildModel({ event });

        expect(model.isEvergreenProgram).toBe(true);
        expect(model.eventTypeLabel).toBe('Program');
        expect(model.eventScheduleDisplayText).toBe('Drop in all summer');
        expect(model.isAffiliateEvent).toBe(true);
        expect(model.affiliateActionUrl).toBe('https://events.example.com/register');
        expect(model.hostedByLabel).toBe('River City Sports Club');
        expect(model.showPoweredByBracketIqNote).toBe(false);
    });

    it('uses the protected action URL for the public CTA while retaining the editable destination', () => {
        const event = buildEvent({
            affiliateUrl: 'https://events.example.com/register',
            affiliateActionUrl: 'https://bracket-iq.com/out/event/event-one/signed-token',
        });

        const model = buildModel({ event });

        expect(model.isAffiliateEvent).toBe(true);
        expect(model.affiliateActionUrl).toBe(
            'https://bracket-iq.com/out/event/event-one/signed-token',
        );
    });

    it('builds map, capacity, registration, and secure-payment labels', () => {
        const event = buildEvent({
            address: '100 Main Street, Portland, OR',
            location: 'Summit Courts',
            teamSignup: false,
            registrationPaymentMode: 'ONLINE',
            manualPaymentLinks: [],
            manualPaymentInstructions: '',
        });

        const model = buildModel({
            event,
            participantCapacity: 12,
            spotsLeft: 1,
            selectedDivisionBillingPriceCents: 3500,
        });

        expect(model.mapEmbedSrc).toContain(encodeURIComponent('100 Main Street, Portland, OR'));
        expect(model.spotsSummary).toBe('1 spot left');
        expect(model.registrationTypeLabel).toBe('Individual registration');
        expect(model.showSecurePaymentNote).toBe(true);
        expect(model.eventLocationSummary).toBe('Summit Courts');
    });

    it('limits staff details to event and organization staff viewers', () => {
        const assistant = buildUser({ $id: 'assistant-one', firstName: 'Morgan', lastName: 'Lee' });
        const official = buildUser({ $id: 'official-one', firstName: 'Jordan', lastName: 'Kim' });
        const event = buildEvent({
            assistantHostIds: ['assistant-one'],
            assistantHosts: [assistant],
            officialIds: ['official-one'],
            officials: [official],
            officialPositions: [
                { id: 'referee', name: 'Referee', count: 2, order: 1 },
            ] as never,
        });

        const model = buildModel({ event, user: assistant });

        expect(model.canViewStaffSection).toBe(true);
        expect(model.assistantHostNames).toContain('Morgan Lee');
        expect(model.officialNames).toContain('Jordan Kim');
        expect(model.officialPositionsSummary).toBe('Referee x2');
    });

    it('prefers upcoming matches for the selected division and resolves team names', () => {
        const event = buildEvent({
            eventType: 'TOURNAMENT',
            divisions: ['division-open', 'division-club'],
            divisionDetails: [
                { id: 'division-open', key: 'open', name: 'Open' },
                { id: 'division-club', key: 'club', name: 'Club' },
            ],
            fields: [{ $id: 'court-one', name: 'Court One' }] as never,
            timeSlots: [buildTimeSlot({ divisions: ['division-open'] })],
            matches: [
                {
                    $id: 'match-club',
                    start: '2099-07-05T18:00:00.000Z',
                    division: 'division-club',
                    team1Id: 'club-one',
                    team2Id: 'club-two',
                    fieldId: 'court-one',
                },
                {
                    $id: 'match-open',
                    start: '2099-07-06T18:00:00.000Z',
                    division: 'division-open',
                    team1Id: 'open-one',
                    team2Id: 'open-two',
                    fieldId: 'court-one',
                },
            ] as never,
        });
        const [openDivision] = buildDivisionOptionsForEvent(event);

        const model = buildModel({
            event,
            teams: [
                buildTeam({ $id: 'open-one', name: 'Cascade Crew' }),
                buildTeam({ $id: 'open-two', name: 'Harbor Strikers' }),
            ],
            selectedDivisionOption: openDivision ?? null,
            divisionDisplayNameIndex: new Map([
                ['division-open', 'Open'],
                ['division-club', 'Club'],
            ]),
        });

        expect(model.schedulePreviewItems).toHaveLength(1);
        expect(model.schedulePreviewItems[0]).toMatchObject({
            id: 'match-open',
            title: 'Cascade Crew vs Harbor Strikers',
            meta: 'Court One',
        });
        expect(model.scheduleDateChips).toHaveLength(1);
        expect(model.supportsScheduleDetails).toBe(true);
    });
});

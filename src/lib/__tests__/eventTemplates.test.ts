import type { Event, Field, TimeSlot } from '@/types';
import { buildEventDivisionId } from '@/lib/divisionTypes';
import {
  addEventTemplateSuffix,
  stripEventTemplateSuffix,
  cloneEventAsTemplate,
  seedEventFromTemplate,
} from '@/lib/eventTemplates';

const makeIdFactory = (prefix = 'id') => {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}_${counter}`;
  };
};

const baseSport = { $id: 'sport_1', name: 'Volleyball' } as any;

const buildBaseEvent = (overrides: Partial<Event> = {}): Event => ({
  $id: 'evt_1',
  name: 'Test Event',
  description: '',
  start: '2026-01-05T10:30:00',
  end: '2026-01-12T10:30:00',
  location: 'Denver',
  coordinates: [0, 0],
  price: 0,
  imageId: '',
  hostId: 'host_1',
  state: 'PUBLISHED',
  maxParticipants: 10,
  teamSizeLimit: 2,
  teamSignup: true,
  singleDivision: true,
  waitListIds: [],
  freeAgentIds: [],
  cancellationRefundHours: 24,
  registrationCutoffHours: 2,
  seedColor: 0,
  $createdAt: '',
  $updatedAt: '',
  eventType: 'LEAGUE',
  sport: baseSport,
  sportId: baseSport.$id,
  divisions: [],
  attendees: 0,
  teams: [],
  players: [],
  officials: [],
  officialIds: [],
  ...overrides,
});

describe('eventTemplates', () => {
  it('adds template suffix without duplicating it', () => {
    expect(addEventTemplateSuffix('My Event')).toBe('My Event (TEMPLATE)');
    expect(addEventTemplateSuffix('My Event (TEMPLATE)')).toBe('My Event (TEMPLATE)');
    expect(addEventTemplateSuffix('  My Event  ')).toBe('My Event (TEMPLATE)');
  });

  it('strips template suffix when present', () => {
    expect(stripEventTemplateSuffix('My Event (TEMPLATE)')).toBe('My Event');
    expect(stripEventTemplateSuffix('My Event')).toBe('My Event');
  });

  it('clones an event into a TEMPLATE with new slot ids and no participants', () => {
    const idFactory = makeIdFactory('new');

    const fieldA: Field = {
      $id: 'field_a',
      name: 'Court 1',
      location: 'Denver',
      lat: 0,
      long: 0,
    };

    const slotA: TimeSlot = {
      $id: 'slot_a',
      dayOfWeek: 2,
      startTimeMinutes: 18 * 60,
      endTimeMinutes: 20 * 60,
      startDate: '2026-01-05T10:30:00',
      endDate: '2026-01-12T10:30:00',
      repeating: true,
      scheduledFieldId: 'field_a',
    };

    const source = buildBaseEvent({
      name: 'League Night',
      state: 'PUBLISHED',
      organizationId: null,
      fields: [fieldA],
      fieldIds: ['field_a'],
      timeSlots: [slotA],
      timeSlotIds: ['slot_a'],
      teamIds: ['team_1'],
      userIds: ['user_1'],
      waitListIds: ['user_2'],
      freeAgentIds: ['user_3'],
    });

    const template = cloneEventAsTemplate(source, { templateId: 'tmpl_1', idFactory });

    expect(template.$id).toBe('tmpl_1');
    expect(template.state).toBe('TEMPLATE');
    expect(template.name).toBe('League Night (TEMPLATE)');
    expect(template.teamIds).toEqual([]);
    expect(template.userIds).toEqual([]);
    expect(template.waitListIds).toEqual([]);
    expect(template.freeAgentIds).toEqual([]);

    expect(template.timeSlots?.[0].$id).toBe('new_2');
    expect(template.timeSlots?.[0].$id).not.toBe('slot_a');
    expect(template.timeSlotIds).toEqual(['new_2']);

    // Local fields should be cloned and time slots rewired to the new field id.
    expect(template.fields?.[0].$id).toBe('new_1');
    expect(template.fieldIds).toEqual(['new_1']);
    expect(template.timeSlots?.[0].scheduledFieldId).toBe('new_1');
  });

  it('does not persist host on organization templates', () => {
    const template = cloneEventAsTemplate(
      buildBaseEvent({
        organizationId: 'org_1',
        hostId: 'host_1',
      }),
      { templateId: 'tmpl_org' },
    );

    expect(template.organizationId).toBe('org_1');
    expect(template.hostId).toBe('');
  });

  it('remaps division identifiers to the new template id for complex division payloads without dropping metadata', () => {
    const openSourceId = buildEventDivisionId('event_source', 'open');
    const advancedSourceId = buildEventDivisionId('event_source', 'advanced');
    const playoffUpperSourceId = buildEventDivisionId('event_source', 'playoff_upper');
    const playoffLowerSourceId = buildEventDivisionId('event_source', 'playoff_lower');

    const templateId = 'tmpl_complex';
    const openTemplateId = buildEventDivisionId(templateId, 'open');
    const advancedTemplateId = buildEventDivisionId(templateId, 'advanced');
    const playoffUpperTemplateId = buildEventDivisionId(templateId, 'playoff_upper');
    const playoffLowerTemplateId = buildEventDivisionId(templateId, 'playoff_lower');

    const source = buildBaseEvent({
      $id: 'event_source',
      name: 'Complex Source League',
      state: 'PUBLISHED',
      organizationId: null,
      singleDivision: false,
      divisions: [openSourceId, advancedSourceId],
      divisionFieldIds: {
        [openSourceId]: ['field_a'],
        advanced: ['field_b'],
      },
      divisionDetails: [
        {
          id: openSourceId,
          key: 'open',
          name: 'Open',
          divisionTypeId: 'skill_open_age_18plus',
          divisionTypeName: 'Open • 18+',
          ratingType: 'SKILL',
          gender: 'C',
          ageCutoffDate: '2026-08-01T19:00:00.000Z',
          ageCutoffLabel: 'Age 18+ as of 08/01/2026',
          ageCutoffSource: 'US Youth Soccer seasonal-year age grouping guidance.',
          playoffPlacementDivisionIds: [playoffUpperSourceId, '', 'playoff_lower'],
          teamIds: ['team_a'],
        } as any,
        {
          id: advancedSourceId,
          key: 'advanced',
          name: 'Advanced',
          divisionTypeId: 'skill_premier_age_u17',
          divisionTypeName: 'Premier • U17',
          ratingType: 'SKILL',
          gender: 'C',
          ageCutoffDate: '2026-08-01T19:00:00.000Z',
          ageCutoffLabel: 'Age 17 or younger as of 08/01/2026',
          ageCutoffSource: 'US Youth Soccer seasonal-year age grouping guidance.',
          teamIds: ['team_b'],
        } as any,
      ],
      playoffDivisionDetails: [
        {
          id: playoffUpperSourceId,
          key: 'playoff_upper',
          name: 'Playoff Upper',
          kind: 'PLAYOFF',
        } as any,
        {
          id: 'playoff_lower',
          key: 'playoff_lower',
          name: 'Playoff Lower',
          kind: 'PLAYOFF',
        } as any,
      ],
      fields: [
        {
          $id: 'field_a',
          name: 'Court A',
          location: 'Denver',
          lat: 0,
          long: 0,
          divisions: [openSourceId, 'advanced'],
        } as any,
        {
          $id: 'field_b',
          name: 'Court B',
          location: 'Denver',
          lat: 0,
          long: 0,
          divisions: [advancedSourceId],
        } as any,
      ],
      fieldIds: ['field_a', 'field_b'],
      timeSlots: [
        {
          $id: 'slot_a',
          dayOfWeek: 2,
          startTimeMinutes: 18 * 60,
          endTimeMinutes: 20 * 60,
          startDate: '2026-01-05T10:30:00',
          endDate: '2026-01-12T10:30:00',
          repeating: true,
          scheduledFieldId: 'field_a',
          divisions: [openSourceId],
        } as any,
      ],
      timeSlotIds: ['slot_a'],
    });

    const template = cloneEventAsTemplate(source, {
      templateId,
      idFactory: makeIdFactory('map'),
    });

    expect(template.divisions).toEqual([openTemplateId, advancedTemplateId]);
    expect(template.divisionFieldIds).toEqual({
      [openTemplateId]: ['map_1'],
      [advancedTemplateId]: ['map_2'],
    });
    expect(template.divisionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: openTemplateId,
          key: 'open',
          divisionTypeId: 'skill_open_age_18plus',
          divisionTypeName: 'Open • 18+',
          ageCutoffDate: '2026-08-01T19:00:00.000Z',
          ageCutoffLabel: 'Age 18+ as of 08/01/2026',
          ageCutoffSource: 'US Youth Soccer seasonal-year age grouping guidance.',
          playoffPlacementDivisionIds: [playoffUpperTemplateId, '', playoffLowerTemplateId],
        }),
        expect.objectContaining({
          id: advancedTemplateId,
          key: 'advanced',
          divisionTypeId: 'skill_premier_age_u17',
          divisionTypeName: 'Premier • U17',
          ageCutoffDate: '2026-08-01T19:00:00.000Z',
          ageCutoffLabel: 'Age 17 or younger as of 08/01/2026',
          ageCutoffSource: 'US Youth Soccer seasonal-year age grouping guidance.',
        }),
      ]),
    );
    expect(template.playoffDivisionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: playoffUpperTemplateId,
          key: 'playoff_upper',
        }),
        expect.objectContaining({
          id: playoffLowerTemplateId,
          key: 'playoff_lower',
        }),
      ]),
    );
    expect(template.timeSlots?.[0]?.divisions).toEqual([openTemplateId]);
    expect((template.fields?.[0] as any)?.divisions).toEqual([openTemplateId, advancedTemplateId]);
    expect((template.fields?.[1] as any)?.divisions).toEqual([advancedTemplateId]);

    // Source event must remain unchanged after cloning.
    expect(source.divisions).toEqual([openSourceId, advancedSourceId]);
    expect(source.divisionDetails?.[0]?.id).toBe(openSourceId);
    expect(source.timeSlots?.[0]?.divisions).toEqual([openSourceId]);
  });

  it('seeds a draft event from a template with aligned dates and new slot ids', () => {
    const idFactory = makeIdFactory('seed');

    const template = buildBaseEvent({
      $id: 'tmpl_evt',
      name: 'League Night (TEMPLATE)',
      state: 'TEMPLATE',
      organizationId: 'org_1',
      fieldIds: ['org_field_1'],
      timeSlots: [
        {
          $id: 'tmpl_slot',
          dayOfWeek: 4,
          startTimeMinutes: 19 * 60,
          endTimeMinutes: 21 * 60,
          startDate: '2026-01-05T10:30:00',
          endDate: '2026-01-12T10:30:00',
          repeating: true,
          scheduledFieldId: 'org_field_1',
        },
      ],
      timeSlotIds: ['tmpl_slot'],
    });

    const seeded = seedEventFromTemplate(template, {
      newEventId: 'evt_new',
      newStartDate: new Date('2026-02-01T00:00:00'),
      hostId: 'host_1',
      idFactory,
    });

    expect(seeded.$id).toBe('evt_new');
    expect(seeded.state).toBe('DRAFT');
    expect(seeded.name).toBe('League Night');
    expect(seeded.start).toBe('2026-02-01T10:30:00');
    expect(seeded.end).toBe('2026-02-08T10:30:00');

    expect(seeded.teamIds).toEqual([]);
    expect(seeded.userIds).toEqual([]);

    expect(seeded.timeSlots?.[0].$id).toBe('seed_1');
    expect(seeded.timeSlots?.[0].$id).not.toBe('tmpl_slot');
    expect(seeded.timeSlotIds).toEqual(['seed_1']);
    expect(seeded.timeSlots?.[0].startDate).toBe('2026-02-01T10:30:00');
    expect(seeded.timeSlots?.[0].endDate).toBe('2026-02-08T10:30:00');
  });

  it('preserves scheduling and league config while clearing matches when seeding from template', () => {
    const template = buildBaseEvent({
      $id: 'tmpl_cfg',
      name: 'Configured League (TEMPLATE)',
      state: 'TEMPLATE',
      gamesPerOpponent: 2,
      includePlayoffs: true,
      playoffTeamCount: 8,
      matchDurationMinutes: 55,
      setDurationMinutes: 20,
      setsPerMatch: 3,
      pointsToVictory: [21, 21, 15],
      allowPaymentPlans: true,
      installmentCount: 2,
      installmentAmounts: [25, 25],
      installmentDueDates: ['2026-01-02T10:30:00', '2026-01-04T10:30:00'],
      leagueScoringConfig: {
        pointsForWin: 3,
        pointsForDraw: 1,
        pointsForLoss: 0,
      } as any,
      timeSlots: [
        {
          $id: 'tmpl_slot_cfg',
          dayOfWeek: 1,
          startTimeMinutes: 18 * 60,
          endTimeMinutes: 20 * 60,
          startDate: '2026-01-05T10:30:00',
          endDate: '2026-01-12T10:30:00',
          repeating: true,
          scheduledFieldId: 'org_field_1',
        },
      ],
      timeSlotIds: ['tmpl_slot_cfg'],
      fieldIds: ['org_field_1'],
      matches: [{ $id: 'match_cfg' } as any],
    });

    const seeded = seedEventFromTemplate(template, {
      newEventId: 'evt_cfg',
      newStartDate: new Date('2026-02-01T00:00:00'),
      hostId: 'host_1',
      idFactory: makeIdFactory('seed_cfg'),
    });

    expect(seeded.matches).toEqual([]);
    expect(seeded.timeSlots).toHaveLength(1);
    expect(seeded.gamesPerOpponent).toBe(2);
    expect(seeded.includePlayoffs).toBe(true);
    expect(seeded.playoffTeamCount).toBe(8);
    expect(seeded.matchDurationMinutes).toBe(55);
    expect(seeded.setDurationMinutes).toBe(20);
    expect(seeded.setsPerMatch).toBe(3);
    expect(seeded.pointsToVictory).toEqual([21, 21, 15]);
    expect(seeded.allowPaymentPlans).toBe(true);
    expect(seeded.installmentCount).toBe(2);
    expect(seeded.installmentAmounts).toEqual([25, 25]);
    expect(seeded.installmentDueDates).toEqual(['2026-01-02T10:30:00', '2026-01-04T10:30:00']);
    expect(seeded.leagueScoringConfig).toEqual({
      pointsForWin: 3,
      pointsForDraw: 1,
      pointsForLoss: 0,
    });
  });

  it('remaps template division identifiers to the new event id when seeding from template', () => {
    const templateOpenId = buildEventDivisionId('tmpl_seed', 'open');
    const templatePlayoffId = buildEventDivisionId('tmpl_seed', 'playoff');
    const seededOpenId = buildEventDivisionId('event_seeded', 'open');
    const seededPlayoffId = buildEventDivisionId('event_seeded', 'playoff');

    const seeded = seedEventFromTemplate(
      buildBaseEvent({
        $id: 'tmpl_seed',
        name: 'Seed Complex (TEMPLATE)',
        state: 'TEMPLATE',
        organizationId: null,
        singleDivision: false,
        divisions: [templateOpenId],
        divisionDetails: [
          {
            id: templateOpenId,
            key: 'open',
            name: 'Open',
            playoffPlacementDivisionIds: [templatePlayoffId],
          } as any,
        ],
        playoffDivisionDetails: [
          {
            id: templatePlayoffId,
            key: 'playoff',
            name: 'Playoff',
            kind: 'PLAYOFF',
          } as any,
        ],
        divisionFieldIds: {
          [templateOpenId]: ['field_tmpl'],
        },
        fields: [
          {
            $id: 'field_tmpl',
            name: 'Court Template',
            location: 'Denver',
            lat: 0,
            long: 0,
            divisions: [templateOpenId],
          } as any,
        ],
        fieldIds: ['field_tmpl'],
        timeSlots: [
          {
            $id: 'slot_tmpl',
            dayOfWeek: 2,
            startTimeMinutes: 18 * 60,
            endTimeMinutes: 20 * 60,
            startDate: '2026-01-05T10:30:00',
            endDate: '2026-01-12T10:30:00',
            repeating: true,
            scheduledFieldId: 'field_tmpl',
            divisions: [templateOpenId],
          } as any,
        ],
        timeSlotIds: ['slot_tmpl'],
      }),
      {
        newEventId: 'event_seeded',
        newStartDate: new Date('2026-03-01T00:00:00'),
        hostId: 'host_1',
        idFactory: makeIdFactory('seed_map'),
      },
    );

    expect(seeded.divisions).toEqual([seededOpenId]);
    expect(seeded.divisionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: seededOpenId,
          playoffPlacementDivisionIds: [seededPlayoffId],
        }),
      ]),
    );
    expect(seeded.playoffDivisionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: seededPlayoffId,
        }),
      ]),
    );
    expect(seeded.divisionFieldIds).toEqual({
      [seededOpenId]: ['seed_map_1'],
    });
    expect((seeded.fields?.[0] as any)?.divisions).toEqual([seededOpenId]);
    expect(seeded.timeSlots?.[0]?.divisions).toEqual([seededOpenId]);
  });
});

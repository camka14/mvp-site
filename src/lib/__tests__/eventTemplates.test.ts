import type { Event, Field, TimeSlot } from '@/types';
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
  fieldType: 'INDOOR',
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
  referees: [],
  refereeIds: [],
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
      type: 'INDOOR',
      fieldNumber: 1,
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
});


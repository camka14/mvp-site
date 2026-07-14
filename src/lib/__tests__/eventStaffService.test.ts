import {
  buildEventStaffPutInput,
  stripEventStaffAssignments,
  type EventStaffDraft,
  type EventStaffSnapshot,
} from '@/lib/eventStaffService';

const snapshot: EventStaffSnapshot = {
  contractVersion: 1,
  eventId: 'event_1',
  revision: 'revision_after_event_patch',
  assistantHostIds: [],
  officialPositions: [{
    id: 'position_server_referee',
    name: 'Referee',
    count: 1,
    order: 0,
  }],
  eventOfficials: [],
  officialIds: [],
  staffInvites: [],
};

describe('event staff client reconciliation', () => {
  it('rebases draft position and field IDs onto the event state returned after the ordinary save', () => {
    const desiredEvent: EventStaffDraft = {
      hostId: 'host_1',
      assistantHostIds: ['host_1', 'assistant_1'],
      officialIds: ['official_1'],
      officialPositions: [{
        id: 'position_client_referee',
        name: 'Referee',
        count: 1,
        order: 0,
      }],
      eventOfficials: [{
        id: 'official_client_1',
        userId: 'official_1',
        positionIds: ['position_client_referee'],
        fieldIds: ['field_client_court_a'],
        isActive: true,
      }],
      fields: [{
        $id: 'field_client_court_a',
        name: 'Court A',
      } as any],
      pendingStaffInvites: [{
        firstName: 'Casey',
        lastName: 'Official',
        email: 'CASEY@EXAMPLE.COM',
        roles: ['OFFICIAL'],
      }],
    };

    const input = buildEventStaffPutInput({
      desiredEvent,
      persistedEvent: {
        hostId: 'host_1',
        fieldIds: ['field_server_court_a'],
        fields: [{
          $id: 'field_server_court_a',
          name: 'Court A',
        } as any],
      },
      snapshot,
      expectedRevision: 'revision_loaded_with_editor',
    });

    expect(input).toEqual({
      contractVersion: 1,
      expectedRevision: 'revision_loaded_with_editor',
      assistantHostIds: ['assistant_1'],
      eventOfficials: [{
        id: 'official_client_1',
        userId: 'official_1',
        positionIds: ['position_server_referee'],
        fieldIds: ['field_server_court_a'],
        isActive: true,
      }],
      pendingInvites: [{
        firstName: 'Casey',
        lastName: 'Official',
        email: 'casey@example.com',
        roles: ['OFFICIAL'],
      }],
    });
  });

  it('uses the freshly created event revision when no loaded editor revision exists', () => {
    const input = buildEventStaffPutInput({
      desiredEvent: {},
      persistedEvent: {},
      snapshot,
      expectedRevision: null,
    });

    expect(input.expectedRevision).toBe('revision_after_event_patch');
  });

  it('removes only staff assignments from the ordinary create payload', () => {
    const stripped = stripEventStaffAssignments({
      assistantHostIds: ['assistant_1'],
      officialIds: ['official_1'],
      eventOfficials: [{
        id: 'official_1',
        userId: 'official_1',
        positionIds: ['position_1'],
        fieldIds: [],
      }],
      officialPositions: [{
        id: 'position_1',
        name: 'Referee',
        count: 1,
        order: 0,
      }],
      pendingStaffInvites: [{
        firstName: 'Casey',
        lastName: 'Official',
        email: 'casey@example.com',
        roles: ['OFFICIAL'],
      }],
    });

    expect(stripped.assistantHostIds).toEqual([]);
    expect(stripped.officialIds).toEqual([]);
    expect(stripped.eventOfficials).toEqual([]);
    expect(stripped).not.toHaveProperty('pendingStaffInvites');
    expect(stripped.officialPositions).toEqual([
      expect.objectContaining({ id: 'position_1', name: 'Referee' }),
    ]);
  });
});

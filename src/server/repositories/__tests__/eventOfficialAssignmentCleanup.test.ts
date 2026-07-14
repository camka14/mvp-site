/** @jest-environment node */

import { clearRemovedEventOfficialMatchAssignments } from '@/server/repositories/events';

describe('clearRemovedEventOfficialMatchAssignments', () => {
  it('clears assignments when a retained official loses the assigned position or field', async () => {
    const update = jest.fn().mockResolvedValue({});
    const client = {
      matches: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'match_position',
            fieldId: 'field_1',
            officialId: 'official_1',
            officialCheckedIn: true,
            officialIds: [{
              holderType: 'OFFICIAL',
              eventOfficialId: 'event_official_1',
              userId: 'official_1',
              positionId: 'position_removed',
              slotIndex: 0,
              checkedIn: true,
              hasConflict: false,
            }],
          },
          {
            id: 'match_field',
            fieldId: 'field_2',
            officialId: 'official_1',
            officialCheckedIn: true,
            officialIds: [{
              holderType: 'OFFICIAL',
              eventOfficialId: 'event_official_1',
              userId: 'official_1',
              positionId: 'position_kept',
              slotIndex: 0,
              checkedIn: true,
              hasConflict: false,
            }],
          },
        ]),
        update,
      },
    } as any;

    const updatedCount = await clearRemovedEventOfficialMatchAssignments(
      client,
      'event_1',
      [{
        id: 'event_official_1',
        userId: 'official_1',
        positionIds: ['position_kept'],
        fieldIds: ['field_1'],
        isActive: true,
      }],
    );

    expect(updatedCount).toBe(2);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(1, {
      where: { id: 'match_position' },
      data: {
        officialIds: null,
        officialId: null,
        officialCheckedIn: false,
      },
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: 'match_field' },
      data: {
        officialIds: null,
        officialId: null,
        officialCheckedIn: false,
      },
    });
  });
});

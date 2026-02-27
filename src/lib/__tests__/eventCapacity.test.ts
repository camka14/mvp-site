import { resolveEventParticipantCapacity } from '@/lib/eventCapacity';

describe('resolveEventParticipantCapacity', () => {
  it('returns event max participants for single-division events', () => {
    const capacity = resolveEventParticipantCapacity({
      maxParticipants: 16,
      singleDivision: true,
      divisionDetails: [{ id: 'evt_1__division__open', maxParticipants: 8 } as any],
    });

    expect(capacity).toBe(16);
  });

  it('sums division capacities for split-division events', () => {
    const capacity = resolveEventParticipantCapacity({
      maxParticipants: 12,
      singleDivision: false,
      divisionDetails: [
        { id: 'evt_1__division__open', maxParticipants: 8 } as any,
        { id: 'evt_1__division__a', maxParticipants: 10 } as any,
      ],
    });

    expect(capacity).toBe(18);
  });

  it('falls back to event max participants when split divisions have no capacities', () => {
    const capacity = resolveEventParticipantCapacity({
      maxParticipants: 14,
      singleDivision: false,
      divisionDetails: [
        { id: 'evt_1__division__open', maxParticipants: null } as any,
        { id: 'evt_1__division__a', maxParticipants: 0 } as any,
      ],
    });

    expect(capacity).toBe(14);
  });
});

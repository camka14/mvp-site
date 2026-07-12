import { checkInTeam } from '../teamCheckIns';

if (typeof globalThis.Response === 'undefined') {
  class TestResponse {
    status: number;

    constructor(_body?: unknown, init?: { status?: number }) {
      this.status = init?.status ?? 200;
    }
  }
  globalThis.Response = TestResponse as unknown as typeof Response;
}

const buildClient = () => ({
  teams: {
    findUnique: jest.fn().mockResolvedValue({
      id: 'team-1',
      managerId: 'manager-1',
      headCoachId: null,
      coachIds: [],
    }),
  },
  eventTeamStaffAssignments: {
    findFirst: jest.fn().mockResolvedValue(null),
  },
  eventRegistrations: {
    findFirst: jest.fn(({ where }: { where: { eventTeamId: string } }) => Promise.resolve(
      where.eventTeamId === 'team-outside' ? null : { id: `registration-${where.eventTeamId}` },
    )),
  },
  teamCheckIns: {
    upsert: jest.fn().mockResolvedValue({ id: 'check-in-1' }),
  },
});

const event = {
  id: 'event-1',
  teamSignup: true,
  teamCheckInMode: 'EVENT',
  teamCheckInOpenMinutesBefore: 60,
  start: new Date('2026-07-12T12:00:00.000Z'),
};

describe('team check-ins', () => {
  it('allows authorized event staff or officials to check in a registered team', async () => {
    const client = buildClient();

    await expect(checkInTeam(client as never, {
      event,
      eventTeamId: 'team-2',
      checkedInByUserId: 'official-1',
      canCheckInAnyTeam: true,
      now: new Date('2026-07-12T11:30:00.000Z'),
    })).resolves.toEqual({ id: 'check-in-1' });

    expect(client.teams.findUnique).not.toHaveBeenCalled();
    expect(client.teamCheckIns.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        eventTeamId: 'team-2',
        checkedInByUserId: 'official-1',
      }),
    }));
  });

  it('rejects a team that is not registered for the event', async () => {
    const client = buildClient();

    await expect(checkInTeam(client as never, {
      event,
      eventTeamId: 'team-outside',
      checkedInByUserId: 'official-1',
      canCheckInAnyTeam: true,
      now: new Date('2026-07-12T11:30:00.000Z'),
    })).rejects.toMatchObject({ status: 400 });

    expect(client.teamCheckIns.upsert).not.toHaveBeenCalled();
  });
});

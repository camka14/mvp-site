/** @jest-environment node */

const isEmailEnabledMock = jest.fn();
const sendEmailMock = jest.fn();

const prismaMock = {
  eventRegistrations: { findUnique: jest.fn() },
  events: { findUnique: jest.fn() },
  organizations: { findUnique: jest.fn() },
  authUser: { findUnique: jest.fn() },
  sensitiveUserData: { findFirst: jest.fn() },
  userData: { findUnique: jest.fn() },
  teams: { findUnique: jest.fn() },
  divisions: { findUnique: jest.fn() },
  timeSlots: { findUnique: jest.fn() },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/server/email', () => ({
  isEmailEnabled: () => isEmailEnabledMock(),
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

import { sendEventRegistrationHostNotification } from '@/server/registrationHostNotifications';

describe('sendEventRegistrationHostNotification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isEmailEnabledMock.mockReturnValue(true);
    sendEmailMock.mockResolvedValue(undefined);
    prismaMock.eventRegistrations.findUnique.mockResolvedValue({
      id: 'registration_1',
      eventId: 'event_1',
      registrantId: 'user_1',
      parentId: null,
      registrantType: 'SELF',
      rosterRole: 'PLAYER',
      status: 'ACTIVE',
      eventTeamId: null,
      divisionId: 'division_1',
      divisionTypeId: null,
      divisionTypeKey: 'OPEN',
      slotId: null,
      occurrenceDate: null,
      createdAt: new Date('2026-07-01T18:00:00.000Z'),
    });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      name: 'Summer Cup',
      start: new Date('2026-07-15T18:00:00.000Z'),
      timeZone: 'America/Los_Angeles',
      location: 'Main Gym',
      hostId: 'host_1',
      organizationId: 'org_1',
    });
    prismaMock.organizations.findUnique.mockResolvedValue(null);
    prismaMock.authUser.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === 'host_1') {
        return Promise.resolve({ email: 'host@example.com', name: 'Host User' });
      }
      if (where.id === 'owner_1') {
        return Promise.resolve({ email: 'owner@example.com', name: 'Owner User' });
      }
      if (where.id === 'user_1') {
        return Promise.resolve({ email: 'player@example.com', name: 'Player One' });
      }
      if (where.id === 'manager_1') {
        return Promise.resolve({ email: 'manager@example.com', name: 'Manager One' });
      }
      return Promise.resolve(null);
    });
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue(null);
    prismaMock.userData.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === 'host_1') {
        return Promise.resolve({ firstName: 'Host', lastName: 'User', userName: 'hostuser' });
      }
      if (where.id === 'owner_1') {
        return Promise.resolve({ firstName: 'Owner', lastName: 'User', userName: 'owneruser' });
      }
      if (where.id === 'user_1') {
        return Promise.resolve({ firstName: 'Player', lastName: 'One', userName: 'playerone' });
      }
      if (where.id === 'manager_1') {
        return Promise.resolve({ firstName: 'Manager', lastName: 'One', userName: 'managerone' });
      }
      return Promise.resolve(null);
    });
    prismaMock.teams.findUnique.mockResolvedValue(null);
    prismaMock.divisions.findUnique.mockResolvedValue({
      id: 'division_1',
      name: 'Open',
      key: 'open',
      playoffPlacementDivisionIds: [],
    });
    prismaMock.timeSlots.findUnique.mockResolvedValue(null);
  });

  it('emails the event host for an active participant registration', async () => {
    await sendEventRegistrationHostNotification({
      eventId: 'event_1',
      registrationId: 'registration_1',
    });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'host@example.com',
      subject: '[BracketIQ] New participant registration: Summer Cup',
      text: expect.stringContaining('Registrant: Player One'),
      html: expect.stringContaining('Summer Cup'),
    }));
  });

  it('falls back to the organization owner when the event has no direct host', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      name: 'Summer Cup',
      start: new Date('2026-07-15T18:00:00.000Z'),
      timeZone: 'America/Los_Angeles',
      location: 'Main Gym',
      hostId: null,
      organizationId: 'org_1',
    });
    prismaMock.organizations.findUnique.mockResolvedValueOnce({ ownerId: 'owner_1' });

    await sendEventRegistrationHostNotification({
      eventId: 'event_1',
      registrationId: 'registration_1',
    });

    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'owner@example.com',
    }));
  });

  it('formats team registration details for managers without standalone row ids', async () => {
    prismaMock.eventRegistrations.findUnique.mockResolvedValueOnce({
      id: 'event_1__team__team_1',
      eventId: 'event_1',
      registrantId: 'team_1',
      parentId: 'manager_1',
      registrantType: 'TEAM',
      rosterRole: 'PLAYER',
      status: 'ACTIVE',
      eventTeamId: 'team_1',
      divisionId: 'event_1__division__m_skill_open_age_16plus',
      divisionTypeId: 'skill_open_age_16plus',
      divisionTypeKey: 'm_skill_open_age_16plus',
      slotId: 'slot_1',
      occurrenceDate: '2026-07-20',
      createdAt: new Date('2026-07-06T05:24:14.005Z'),
    });
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      name: 'Summer Cup',
      start: new Date('2026-07-11T16:00:00.000Z'),
      timeZone: 'America/Los_Angeles',
      location: 'Main Gym',
      sportId: 'soccer',
      hostId: 'host_1',
      organizationId: 'org_1',
    });
    prismaMock.teams.findUnique.mockResolvedValueOnce({
      name: 'Aloha',
      managerId: 'manager_1',
      captainId: null,
    });
    prismaMock.divisions.findUnique.mockResolvedValueOnce({
      id: 'event_1__division__m_skill_open_age_16plus',
      name: 'Mens Open 16+',
      key: 'm_skill_open_age_16plus',
      playoffPlacementDivisionIds: [],
    });
    prismaMock.timeSlots.findUnique.mockResolvedValueOnce({
      startTimeMinutes: 18 * 60,
      endTimeMinutes: 20 * 60,
      timeZone: 'America/Los_Angeles',
    });

    await sendEventRegistrationHostNotification({
      eventId: 'event_1',
      registrationId: 'event_1__team__team_1',
    });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const message = sendEmailMock.mock.calls[0][0] as { text: string; html: string };
    expect(message.text).toContain('Event start: July 11, 2026 at 9:00 AM PDT');
    expect(message.text).toContain('Time zone: Pacific Time');
    expect(message.text).toContain('Registrant: Aloha');
    expect(message.text).toContain('Registrant type: Team');
    expect(message.text).toContain('Registrant email: manager@example.com');
    expect(message.text).toContain('Division: Mens Open 16+');
    expect(message.text).toContain('Session: Monday, July 20, 2026, 6:00 PM-8:00 PM, Pacific Time');
    expect(message.text).toContain('Registered at: July 5, 2026 at 10:24 PM PDT');
    expect(message.html).toContain('>Open event page</a>');
    expect(message.text).not.toContain('Registration ID');
    expect(message.text).not.toContain('event_1__team__team_1');
    expect(message.text).not.toContain('event_1__division__m_skill_open_age_16plus');
    expect(message.text).not.toContain('slot_1');
    expect(message.html).not.toContain('Registration ID');
    expect(message.html).not.toContain('event_1__team__team_1');
    expect(message.html).not.toContain('event_1__division__m_skill_open_age_16plus');
    expect(message.html).not.toContain('slot_1');
  });

  it('does not email for registrations that are not active', async () => {
    prismaMock.eventRegistrations.findUnique.mockResolvedValueOnce({
      id: 'registration_1',
      eventId: 'event_1',
      registrantId: 'user_1',
      parentId: null,
      registrantType: 'SELF',
      rosterRole: 'PLAYER',
      status: 'PENDING',
      eventTeamId: null,
      divisionId: null,
      divisionTypeId: null,
      divisionTypeKey: null,
      slotId: null,
      occurrenceDate: null,
      createdAt: new Date('2026-07-01T18:00:00.000Z'),
    });

    await sendEventRegistrationHostNotification({
      eventId: 'event_1',
      registrationId: 'registration_1',
    });

    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

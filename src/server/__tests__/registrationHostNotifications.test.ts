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
      return Promise.resolve(null);
    });
    prismaMock.teams.findUnique.mockResolvedValue(null);
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

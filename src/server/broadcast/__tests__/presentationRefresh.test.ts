/** @jest-environment node */

const broadcastOverlayStatesMock = {
  findMany: jest.fn(),
  updateMany: jest.fn(),
};
const broadcastOverlaysMock = {
  findMany: jest.fn(),
};
const broadcastOverlayActionsMock = {
  create: jest.fn(),
};
const eventsMock = {
  findUnique: jest.fn(),
};
const matchesMock = {
  findFirst: jest.fn(),
};

const transactionClient = {
  broadcastOverlayStates: broadcastOverlayStatesMock,
  broadcastOverlayActions: broadcastOverlayActionsMock,
};

const prismaMock = {
  broadcastOverlayStates: broadcastOverlayStatesMock,
  broadcastOverlays: broadcastOverlaysMock,
  broadcastOverlayActions: broadcastOverlayActionsMock,
  events: eventsMock,
  matches: matchesMock,
  $transaction: jest.fn(async (callback: any) => callback(transactionClient)),
};

const publishBroadcastOverlayStateMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/server/realtime/broadcastOverlayRealtime', () => ({
  publishBroadcastOverlayState: (...args: any[]) => publishBroadcastOverlayStateMock(...args),
}));

import {
  createEmptyMatchPresentationState,
  refreshBroadcastPresentationForEvent,
} from '../presentation';
import { DEFAULT_BROADCAST_OVERLAY_CONFIG } from '../schemas';

describe('broadcast presentation refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(transactionClient));
    eventsMock.findUnique.mockResolvedValue({
      id: 'event_1',
      name: 'River City Beach Open',
      location: 'Riverside Courts',
      address: null,
      organizerName: 'River City Sports Club',
      imageId: null,
      organizationId: null,
      sportId: null,
      eventType: 'TOURNAMENT',
      pointsToVictory: [],
      matchRulesOverride: null,
      archivedAt: null,
    });
    matchesMock.findFirst.mockResolvedValue(null);
    broadcastOverlayStatesMock.updateMany.mockResolvedValue({ count: 1 });
    broadcastOverlayActionsMock.create.mockResolvedValue({});
    publishBroadcastOverlayStateMock.mockReturnValue(1);
  });

  it('clears a deleted active match and publishes a safe no-match state after a schedule rebuild', async () => {
    const selectedState = createEmptyMatchPresentationState({
      eventId: 'event_1',
      eventName: 'River City Beach Open',
      revision: 4,
    });
    selectedState.status = 'LIVE';
    selectedState.teams = [
      { ...selectedState.teams[0], id: 'team_1', displayName: 'Summit United', shortName: 'Summit', abbreviation: 'SUM' },
      { ...selectedState.teams[1], id: 'team_2', displayName: 'Harbor Strikers', shortName: 'Harbor', abbreviation: 'HBR' },
    ];

    broadcastOverlayStatesMock.findMany.mockResolvedValue([
      {
        id: 'state_1',
        overlayId: 'overlay_1',
        eventId: 'event_1',
        activeMatchId: 'match_removed',
        revision: 4,
        scoringMode: 'AUTOMATIC',
        presentationState: selectedState,
        automaticShadowState: selectedState,
      },
    ]);
    broadcastOverlaysMock.findMany.mockResolvedValue([
      {
        id: 'overlay_1',
        eventId: 'event_1',
        organizationId: null,
        archivedAt: null,
        draftConfig: DEFAULT_BROADCAST_OVERLAY_CONFIG,
        publishedConfig: DEFAULT_BROADCAST_OVERLAY_CONFIG,
      },
    ]);

    await refreshBroadcastPresentationForEvent({
      eventId: 'event_1',
      changedMatchIds: ['match_removed'],
      reason: 'SCHEDULE_CHANGE',
    });

    expect(broadcastOverlayStatesMock.updateMany).toHaveBeenCalledWith({
      where: { id: 'state_1', revision: 4 },
      data: expect.objectContaining({
        activeMatchId: null,
        revision: 5,
        presentationState: expect.objectContaining({
          revision: 5,
          status: 'NO_MATCH',
          presentation: expect.objectContaining({ scoreboardVisible: false }),
        }),
      }),
    });
    expect(broadcastOverlayActionsMock.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        actionType: 'MATCH_CHANGED',
        presentationRevision: 5,
      }),
    }));
    expect(publishBroadcastOverlayStateMock).toHaveBeenCalledWith(expect.objectContaining({
      overlayId: 'overlay_1',
      state: expect.objectContaining({
        revision: 5,
        status: 'NO_MATCH',
      }),
    }));
  });

  it('does not keep a deleted match on air while manual presentation override is active', async () => {
    const manualState = createEmptyMatchPresentationState({
      eventId: 'event_1',
      eventName: 'River City Beach Open',
      revision: 8,
      scoringMode: 'MANUAL_OVERRIDE',
    });
    manualState.status = 'LIVE';
    manualState.teams = [
      { ...manualState.teams[0], id: 'team_1', displayName: 'Removed Team One', shortName: 'One', abbreviation: 'ONE' },
      { ...manualState.teams[1], id: 'team_2', displayName: 'Removed Team Two', shortName: 'Two', abbreviation: 'TWO' },
    ];
    broadcastOverlayStatesMock.findMany.mockResolvedValue([
      {
        id: 'state_manual',
        overlayId: 'overlay_1',
        eventId: 'event_1',
        activeMatchId: 'match_removed',
        revision: 8,
        scoringMode: 'MANUAL_OVERRIDE',
        presentationState: manualState,
        automaticShadowState: manualState,
      },
    ]);
    broadcastOverlaysMock.findMany.mockResolvedValue([
      {
        id: 'overlay_1',
        eventId: 'event_1',
        organizationId: null,
        archivedAt: null,
        draftConfig: DEFAULT_BROADCAST_OVERLAY_CONFIG,
        publishedConfig: DEFAULT_BROADCAST_OVERLAY_CONFIG,
      },
    ]);

    await refreshBroadcastPresentationForEvent({
      eventId: 'event_1',
      changedMatchIds: ['match_removed'],
      reason: 'MATCH_DELETE',
    });

    expect(broadcastOverlayStatesMock.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        activeMatchId: null,
        presentationState: expect.objectContaining({
          status: 'NO_MATCH',
          scoringMode: 'MANUAL_OVERRIDE',
          presentation: expect.objectContaining({ scoreboardVisible: false }),
        }),
      }),
    }));
  });
});

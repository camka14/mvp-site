const tx = {
  broadcastOverlays: { findFirst: jest.fn() },
  broadcastOverlayStates: { findUnique: jest.fn(), updateMany: jest.fn() },
  broadcastOverlayActions: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
};

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
  },
}));
jest.mock('@/server/realtime/broadcastOverlayRealtime', () => ({
  publishBroadcastOverlayState: jest.fn(),
}));

import {
  applyBroadcastOverlayCommand,
  BroadcastOverlayRevisionConflictError,
} from '../commands';
import { createEmptyMatchPresentationState } from '../presentation';
import { DEFAULT_BROADCAST_OVERLAY_CONFIG } from '../schemas';

const overlay = {
  id: 'overlay_1',
  eventId: 'event_1',
  organizationId: 'org_1',
  archivedAt: null,
  draftConfig: DEFAULT_BROADCAST_OVERLAY_CONFIG,
  publishedConfig: null,
};

describe('broadcast overlay commands', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tx.broadcastOverlays.findFirst.mockResolvedValue(overlay);
    tx.broadcastOverlayActions.findUnique.mockResolvedValue(null);
    tx.broadcastOverlayActions.findFirst.mockResolvedValue(null);
    tx.broadcastOverlayStates.updateMany.mockResolvedValue({ count: 1 });
    tx.broadcastOverlayActions.create.mockImplementation(async ({ data }: any) => ({ ...data, createdAt: new Date('2026-07-11T05:35:00.000Z') }));
  });

  it('rejects a stale expected revision with the current safe snapshot', async () => {
    const state = createEmptyMatchPresentationState({ eventId: 'event_1', revision: 4 });
    tx.broadcastOverlayStates.findUnique.mockResolvedValue({
      id: 'state_1', overlayId: 'overlay_1', eventId: 'event_1', revision: 4,
      scoringMode: 'AUTOMATIC', activeMatchId: null,
      presentationState: state, automaticShadowState: state,
      manualOverrideBaseRevision: null, manualOverrideStartedAt: null,
      manualOverrideStartedByUserId: null, manualOverrideReason: null,
    });

    await expect(applyBroadcastOverlayCommand({
      eventId: 'event_1', overlayId: 'overlay_1', actorUserId: 'admin_1',
      command: { type: 'SET_VISIBILITY', visible: false, expectedRevision: 3, requestId: '2d48cddf-50f6-48eb-b0e3-f433a914b780' },
    })).rejects.toBeInstanceOf(BroadcastOverlayRevisionConflictError);
  });

  it('enters presentation-only manual override without touching official match delegates', async () => {
    const state = createEmptyMatchPresentationState({ eventId: 'event_1', revision: 4 });
    tx.broadcastOverlayStates.findUnique.mockResolvedValue({
      id: 'state_1', overlayId: 'overlay_1', eventId: 'event_1', revision: 4,
      scoringMode: 'AUTOMATIC', activeMatchId: null,
      presentationState: state, automaticShadowState: state,
      manualOverrideBaseRevision: null, manualOverrideStartedAt: null,
      manualOverrideStartedByUserId: null, manualOverrideReason: null,
    });

    const result = await applyBroadcastOverlayCommand({
      eventId: 'event_1', overlayId: 'overlay_1', actorUserId: 'admin_1',
      command: { type: 'ENTER_MANUAL_OVERRIDE', reason: 'Correct the on-air display', expectedRevision: 4, requestId: '5a109dc8-a0ab-45c2-b077-5815cf3bd01c' },
    });

    expect(result.state.scoringMode).toBe('MANUAL_OVERRIDE');
    expect(tx.broadcastOverlayStates.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ scoringMode: 'MANUAL_OVERRIDE', manualOverrideStartedByUserId: 'admin_1' }),
    }));
    expect((tx as Record<string, unknown>).matches).toBeUndefined();
  });
});


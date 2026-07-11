jest.mock('@/server/realtime/broadcastOverlayRealtime', () => ({
  publishBroadcastOverlayRevocation: jest.fn(),
}));

import { deleteOrArchiveEvent } from '../archivePolicy';
import { publishBroadcastOverlayRevocation } from '@/server/realtime/broadcastOverlayRealtime';

const mockedPublishBroadcastOverlayRevocation = publishBroadcastOverlayRevocation as jest.MockedFunction<
  typeof publishBroadcastOverlayRevocation
>;

const createArchiveClient = () => {
  const client: Record<string, any> = {
    events: {
      update: jest.fn().mockResolvedValue({ id: 'event_1' }),
    },
    broadcastOverlays: {
      count: jest.fn().mockResolvedValue(2),
      findMany: jest.fn().mockResolvedValue([
        { id: 'overlay_1' },
        { id: 'overlay_2' },
      ]),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    broadcastOverlayAccessTokens: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'token_1', overlayId: 'overlay_1' },
        { id: 'token_2', overlayId: 'overlay_1' },
        { id: 'token_3', overlayId: 'overlay_2' },
      ]),
      updateMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
  };
  client.$transaction = jest.fn(async (callback: (tx: typeof client) => Promise<unknown>) => callback(client));
  return client;
};

describe('event broadcast overlay archival', () => {
  beforeEach(() => {
    mockedPublishBroadcastOverlayRevocation.mockReset();
  });

  it('commits overlay and token archival before disconnecting every active program capability', async () => {
    const client = createArchiveClient();
    let transactionCompleted = false;
    client.$transaction.mockImplementation(async (callback: (tx: typeof client) => Promise<unknown>) => {
      const result = await callback(client);
      expect(mockedPublishBroadcastOverlayRevocation).not.toHaveBeenCalled();
      transactionCompleted = true;
      return result;
    });

    await expect(deleteOrArchiveEvent({
      client,
      event: { id: 'event_1' },
      actorUserId: 'user_1',
      reason: 'delete_requested',
    })).resolves.toMatchObject({
      action: 'archived',
      entityType: 'event',
      entityId: 'event_1',
    });

    expect(transactionCompleted).toBe(true);
    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(client.broadcastOverlays.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['overlay_1', 'overlay_2'] }, archivedAt: null },
      data: expect.objectContaining({ status: 'ARCHIVED' }),
    }));
    expect(client.broadcastOverlayAccessTokens.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { overlayId: { in: ['overlay_1', 'overlay_2'] }, revokedAt: null },
      data: expect.objectContaining({ revokeReason: 'EVENT_ARCHIVED' }),
    }));
    expect(mockedPublishBroadcastOverlayRevocation).toHaveBeenCalledTimes(3);
    expect(mockedPublishBroadcastOverlayRevocation).toHaveBeenNthCalledWith(1, {
      overlayId: 'overlay_1',
      accessTokenId: 'token_1',
    });
    expect(mockedPublishBroadcastOverlayRevocation).toHaveBeenNthCalledWith(2, {
      overlayId: 'overlay_1',
      accessTokenId: 'token_2',
    });
    expect(mockedPublishBroadcastOverlayRevocation).toHaveBeenNthCalledWith(3, {
      overlayId: 'overlay_2',
      accessTokenId: 'token_3',
    });
  });

  it('does not emit a socket revocation when the archive transaction fails', async () => {
    const client = createArchiveClient();
    client.$transaction.mockRejectedValue(new Error('archive transaction failed'));

    await expect(deleteOrArchiveEvent({
      client,
      event: { id: 'event_1' },
      actorUserId: 'user_1',
      reason: 'delete_requested',
    })).rejects.toThrow('archive transaction failed');

    expect(mockedPublishBroadcastOverlayRevocation).not.toHaveBeenCalled();
  });
});

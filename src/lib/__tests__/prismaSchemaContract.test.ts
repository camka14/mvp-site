import {
  PrismaSchemaContractError,
  requirePrismaSchemaContract,
} from '@/lib/prismaSchemaContract';

describe('requirePrismaSchemaContract', () => {
  it('fails closed when Prisma rejects a requested field', async () => {
    await expect(
      requirePrismaSchemaContract('Events', async () => {
        throw new Error('Unknown argument `joinPolicy` for type EventsUpdateInput.');
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<PrismaSchemaContractError>>({
        name: 'PrismaSchemaContractError',
        model: 'Events',
        field: 'joinPolicy',
      }),
    );
  });

  it('preserves non-schema write failures', async () => {
    const failure = new Error('Connection reset');

    await expect(
      requirePrismaSchemaContract('Teams', async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
  });
});

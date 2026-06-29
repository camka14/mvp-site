/** @jest-environment node */

jest.mock('../../src/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import { backfillEventTemplateRecords } from '../backfill-event-template-records';

describe('backfill-event-template-records', () => {
  it('is dry-run by default and skips legacy template events that already have dedicated rows', async () => {
    const client = {
      events: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'legacy_existing', name: 'Existing', hostId: 'host_1', organizationId: null },
          { id: 'legacy_missing', name: 'Missing', hostId: 'host_1', organizationId: null },
        ]),
      },
      eventTemplates: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ id: 'template_existing', archivedAt: null })
          .mockResolvedValueOnce(null),
      },
    };
    const loadEvent = jest.fn();
    const createTemplate = jest.fn();

    const result = await backfillEventTemplateRecords(
      { apply: false },
      { client, loadEvent, createTemplate },
    );

    expect(client.events.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { state: 'TEMPLATE' },
    }));
    expect(loadEvent).not.toHaveBeenCalled();
    expect(createTemplate).not.toHaveBeenCalled();
    expect(result).toEqual({
      scanned: 2,
      created: [],
      skippedExisting: [{ sourceEventId: 'legacy_existing', templateId: 'template_existing' }],
    });
  });

  it('creates missing dedicated template rows once when apply is set', async () => {
    const sourceEvent = { $id: 'legacy_missing', name: 'Missing', hostId: ' host_1 ' } as any;
    const client = {
      events: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'legacy_missing', name: 'Missing', hostId: ' host_1 ', organizationId: null },
        ]),
      },
      eventTemplates: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const loadEvent = jest.fn().mockResolvedValue(sourceEvent);
    const createTemplate = jest.fn().mockResolvedValue({ template: { id: 'template_created' } });

    const result = await backfillEventTemplateRecords(
      { apply: true },
      { client, loadEvent, createTemplate },
    );

    expect(loadEvent).toHaveBeenCalledWith('legacy_missing', client);
    expect(createTemplate).toHaveBeenCalledWith(
      sourceEvent,
      { createdByUserId: 'host_1' },
      client,
    );
    expect(result).toEqual({
      scanned: 1,
      created: [{ sourceEventId: 'legacy_missing', templateId: 'template_created' }],
      skippedExisting: [],
    });
  });
});

import {
  buildRequiredSignatureTasks,
  buildSignatureCompletionKey,
  isSignedDocumentStatus,
  pickPrimaryBill,
} from '@/lib/eventTeamCompliance';

describe('eventTeamCompliance', () => {
  it('builds participant-only signature tasks for adult registrations', () => {
    const tasks = buildRequiredSignatureTasks({
      templates: [
        { id: 'tmpl_participant', requiredSignerType: 'PARTICIPANT' },
        { id: 'tmpl_parent', requiredSignerType: 'PARENT_GUARDIAN' },
      ],
      context: {
        userId: 'user_adult_1',
        isChildRegistration: false,
      },
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      templateId: 'tmpl_participant',
      signerContext: 'participant',
      signerUserId: 'user_adult_1',
      hostUserId: null,
    });
  });

  it('builds parent and child tasks for child registrations', () => {
    const tasks = buildRequiredSignatureTasks({
      templates: [
        { id: 'tmpl_dual', requiredSignerType: 'PARENT_GUARDIAN_CHILD' },
      ],
      context: {
        userId: 'child_1',
        parentUserId: 'parent_1',
        isChildRegistration: true,
      },
    });

    expect(tasks).toHaveLength(2);
    expect(tasks.map((task) => task.signerContext).sort()).toEqual(['child', 'parent_guardian']);
    expect(tasks.every((task) => task.hostUserId === 'child_1')).toBe(true);
  });

  it('recognizes signed and completed statuses regardless of case', () => {
    expect(isSignedDocumentStatus('SIGNED')).toBe(true);
    expect(isSignedDocumentStatus('completed')).toBe(true);
    expect(isSignedDocumentStatus('UNSIGNED')).toBe(false);
  });

  it('builds stable signature completion keys', () => {
    const key = buildSignatureCompletionKey({
      scopeKey: 'event:event_1',
      templateId: 'tmpl_1',
      signerContext: 'participant',
      hostUserId: null,
    });
    expect(key).toBe('event:event_1|tmpl_1|participant|');
  });

  it('prefers the latest root bill when selecting team summary bill', () => {
    const selected = pickPrimaryBill([
      {
        id: 'child_bill',
        parentBillId: 'team_bill_old',
        updatedAt: '2025-01-02T00:00:00.000Z',
      },
      {
        id: 'team_bill_old',
        parentBillId: null,
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'team_bill_new',
        parentBillId: null,
        updatedAt: '2025-01-03T00:00:00.000Z',
      },
    ]);

    expect(selected).toBeTruthy();
    expect((selected as { id: string }).id).toBe('team_bill_new');
  });
});

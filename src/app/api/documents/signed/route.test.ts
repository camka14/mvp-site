/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const signedDocumentsCreateMock = jest.fn();

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: any[]) => requireSessionMock(...args),
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    signedDocuments: {
      create: (...args: any[]) => signedDocumentsCreateMock(...args),
    },
  },
}));

import { POST } from '@/app/api/documents/signed/route';

it('rejects direct signed-document assertions', async () => {
  requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });

  const response = await POST(new NextRequest('http://localhost/api/documents/signed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'user_1',
      templateId: 'template_1',
      eventId: 'event_1',
      teamId: 'team_1',
    }),
  }));

  expect(response.status).toBe(410);
  expect(signedDocumentsCreateMock).not.toHaveBeenCalled();
});

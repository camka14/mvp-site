/** @jest-environment node */

import { NextRequest } from 'next/server';

const txMock = {
  userData: {
    findUnique: jest.fn(),
  },
  canonicalTeams: {
    create: jest.fn(),
  },
  teams: {
    create: jest.fn(),
    update: jest.fn(),
  },
  eventRegistrations: {
    findUnique: jest.fn(),
  },
  teamStaffAssignments: {
    findMany: jest.fn(),
  },
  eventTeamStaffAssignments: {
    upsert: jest.fn(),
  },
  signedDocuments: {
    findMany: jest.fn(),
  },
};

const prismaMock = {
  $transaction: jest.fn(),
  eventRegistrations: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  templateDocuments: {
    findMany: jest.fn(),
  },
};

const assertPublicWidgetEventMock = jest.fn();
const ensureGuestParentIdentityMock = jest.fn();
const ensureGuestChildUserDataMock = jest.fn();
const ensureGuestParentChildLinkMock = jest.fn();
const signGuestRegistrationTokenMock = jest.fn();
const resolveEventDivisionSelectionMock = jest.fn();
const validateRegistrantAgeForSelectionMock = jest.fn();
const resolveEventRegistrationPriceCentsMock = jest.fn();
const dispatchRequiredEventDocumentsMock = jest.fn();
const upsertEventRegistrationMock = jest.fn();
const buildEventParticipantSnapshotMock = jest.fn();
const syncDivisionTeamMembershipFromRegistrationsMock = jest.fn();
const syncCanonicalTeamRosterMock = jest.fn();
const applyCanonicalTeamRegistrationMetadataMock = jest.fn();
const loadCanonicalTeamByIdMock = jest.fn();
const claimOrCreateEventTeamSnapshotMock = jest.fn();
const loadAndBuildRegistrationAnswerSnapshotMock = jest.fn();
const upsertRegistrationQuestionResponseMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/server/publicGuestRegistration', () => {
  const actual = jest.requireActual('@/server/publicGuestRegistration');
  return {
    ...actual,
    assertPublicWidgetEvent: (...args: unknown[]) => assertPublicWidgetEventMock(...args),
    ensureGuestParentIdentity: (...args: unknown[]) => ensureGuestParentIdentityMock(...args),
    ensureGuestChildUserData: (...args: unknown[]) => ensureGuestChildUserDataMock(...args),
    ensureGuestParentChildLink: (...args: unknown[]) => ensureGuestParentChildLinkMock(...args),
    signGuestRegistrationToken: (...args: unknown[]) => signGuestRegistrationTokenMock(...args),
  };
});
jest.mock('@/app/api/events/[eventId]/registrationDivisionUtils', () => ({
  resolveEventDivisionSelection: (...args: unknown[]) => resolveEventDivisionSelectionMock(...args),
  validateRegistrantAgeForSelection: (...args: unknown[]) => validateRegistrantAgeForSelectionMock(...args),
}));
jest.mock('@/server/paidRegistrationGate', () => ({
  resolveEventRegistrationPriceCents: (...args: unknown[]) => resolveEventRegistrationPriceCentsMock(...args),
}));
jest.mock('@/lib/eventConsentDispatch', () => ({
  dispatchRequiredEventDocuments: (...args: unknown[]) => dispatchRequiredEventDocumentsMock(...args),
}));
jest.mock('@/server/events/eventRegistrations', () => ({
  buildEventRegistrationId: ({ eventId, registrantType, registrantId }: { eventId: string; registrantType: string; registrantId: string }) =>
    `${eventId}__${registrantType.toLowerCase()}__${registrantId}`,
  buildEventParticipantSnapshot: (...args: unknown[]) => buildEventParticipantSnapshotMock(...args),
  syncDivisionTeamMembershipFromRegistrations: (...args: unknown[]) => syncDivisionTeamMembershipFromRegistrationsMock(...args),
  upsertEventRegistration: (...args: unknown[]) => upsertEventRegistrationMock(...args),
}));
jest.mock('@/server/events/weeklyOccurrences', () => ({
  isWeeklyParentEvent: () => false,
  isWeeklyOccurrenceJoinClosed: () => false,
  resolveWeeklyOccurrence: jest.fn(),
  WEEKLY_OCCURRENCE_JOIN_CLOSED_ERROR: 'This weekly occurrence has already started. Joining is closed.',
}));
jest.mock('@/server/teams/teamMembership', () => ({
  syncCanonicalTeamRoster: (...args: unknown[]) => syncCanonicalTeamRosterMock(...args),
  applyCanonicalTeamRegistrationMetadata: (...args: unknown[]) => applyCanonicalTeamRegistrationMetadataMock(...args),
  loadCanonicalTeamById: (...args: unknown[]) => loadCanonicalTeamByIdMock(...args),
  claimOrCreateEventTeamSnapshot: (...args: unknown[]) => claimOrCreateEventTeamSnapshotMock(...args),
}));
jest.mock('@/server/registrationQuestions', () => ({
  loadAndBuildRegistrationAnswerSnapshot: (...args: unknown[]) => loadAndBuildRegistrationAnswerSnapshotMock(...args),
  upsertRegistrationQuestionResponse: (...args: unknown[]) => upsertRegistrationQuestionResponseMock(...args),
}));

import { POST } from '@/app/api/public/organizations/[slug]/events/[eventId]/guest-registrations/route';

const requestFor = (body: unknown) => new NextRequest(
  'http://localhost/api/public/organizations/summit/events/event_1/guest-registrations',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  },
);

const routeContext = {
  params: Promise.resolve({
    slug: 'summit',
    eventId: 'event_1',
  }),
};

describe('public guest event registration route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock));
    prismaMock.eventRegistrations.findUnique.mockResolvedValue(null);
    prismaMock.eventRegistrations.update.mockImplementation(async (params) => params.data);
    prismaMock.templateDocuments.findMany.mockResolvedValue([]);
    txMock.signedDocuments.findMany.mockResolvedValue([]);
    assertPublicWidgetEventMock.mockResolvedValue({
      organization: {
        id: 'org_1',
        slug: 'summit',
        name: 'Summit United',
      },
      event: {
        id: 'event_1',
        name: 'Spring League',
        teamSignup: true,
        organizationId: 'org_1',
        start: new Date('2026-04-01T12:00:00.000Z'),
        requiredTemplateIds: [],
        price: 0,
      },
    });
    resolveEventDivisionSelectionMock.mockResolvedValue({
      ok: true,
      selection: {
        divisionId: 'division_1',
        divisionTypeId: 'u12',
        divisionTypeKey: 'coed_age_u12',
        divisionName: 'U12',
      },
    });
    validateRegistrantAgeForSelectionMock.mockReturnValue({ ageAtEvent: 11 });
    resolveEventRegistrationPriceCentsMock.mockResolvedValue(0);
    ensureGuestParentIdentityMock.mockResolvedValue({
      userId: 'parent_1',
      email: 'parent@test.com',
      authUserExisted: false,
    });
    ensureGuestChildUserDataMock.mockResolvedValue({ userId: 'child_1' });
    dispatchRequiredEventDocumentsMock.mockResolvedValue({
      firstDocumentId: null,
      missingChildEmail: false,
      errors: [],
    });
    upsertEventRegistrationMock.mockResolvedValue({
      id: 'registration_1',
      eventId: 'event_1',
      registrantId: 'child_1',
      registrantType: 'CHILD',
      parentId: 'parent_1',
      rosterRole: 'FREE_AGENT',
      status: 'ACTIVE',
    });
    buildEventParticipantSnapshotMock.mockResolvedValue({
      participants: {
        teamIds: [],
        userIds: [],
        waitListIds: [],
        freeAgentIds: ['child_1'],
        divisions: [],
      },
    });
    loadAndBuildRegistrationAnswerSnapshotMock.mockResolvedValue([
      {
        questionId: 'question_1',
        prompt: 'Uniform size?',
        answerType: 'TEXT',
        required: true,
        sortOrder: 0,
        answer: 'Youth M',
      },
    ]);
    signGuestRegistrationTokenMock.mockReturnValue('guest.jwt');
    txMock.eventRegistrations.findUnique.mockResolvedValue({
      id: 'event_1__team__event_team_1',
      eventId: 'event_1',
      registrantId: 'event_team_1',
      registrantType: 'TEAM',
      parentId: 'event_team_1',
      rosterRole: 'PARTICIPANT',
      status: 'STARTED',
    });
    claimOrCreateEventTeamSnapshotMock.mockResolvedValue({ id: 'event_team_1' });
    loadCanonicalTeamByIdMock.mockResolvedValue({ id: 'team_1', playerRegistrations: [], staffAssignments: [] });
    txMock.teamStaffAssignments.findMany.mockResolvedValue([]);
    txMock.eventTeamStaffAssignments.upsert.mockImplementation(async (params) => params.create);
  });

  it('creates a child free-agent registration without a session', async () => {
    const response = await POST(
      requestFor({
        mode: 'free_agent',
        parent: {
          email: 'Parent@Test.com',
          firstName: 'Pat',
          lastName: 'Parent',
        },
        child: {
          firstName: 'Casey',
          lastName: 'Parent',
          dateOfBirth: '2015-05-10',
        },
        divisionId: 'division_1',
        answers: [{ questionId: 'question_1', answer: 'Youth M' }],
      }),
      routeContext,
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(ensureGuestParentIdentityMock).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({ email: 'parent@test.com' }),
      expect.any(Date),
    );
    expect(ensureGuestChildUserDataMock).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({
        firstName: 'Casey',
        lastName: 'Parent',
        dateOfBirth: expect.any(Date),
      }),
      expect.any(Date),
    );
    expect(ensureGuestParentChildLinkMock).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({ parentId: 'parent_1', childId: 'child_1' }),
      expect.any(Date),
    );
    expect(upsertEventRegistrationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'CHILD',
      registrantId: 'child_1',
      parentId: 'parent_1',
      rosterRole: 'FREE_AGENT',
      status: 'ACTIVE',
      createdBy: 'parent_1',
    }), txMock);
    expect(upsertRegistrationQuestionResponseMock).toHaveBeenCalledWith(expect.objectContaining({
      subjectType: 'EVENT_REGISTRATION',
      subjectId: 'registration_1',
      responderUserId: 'parent_1',
      registrantUserId: 'child_1',
      registrantType: 'CHILD',
    }));
    expect(payload.registrationToken).toBe('guest.jwt');
  });

  it('rejects a future child date of birth before creating a participant', async () => {
    const response = await POST(
      requestFor({
        mode: 'free_agent',
        parent: {
          email: 'parent@test.com',
          firstName: 'Pat',
          lastName: 'Parent',
        },
        child: {
          firstName: 'Casey',
          lastName: 'Parent',
          dateOfBirth: '2999-01-01',
        },
        divisionId: 'division_1',
        answers: [{ questionId: 'question_1', answer: 'Youth M' }],
      }),
      routeContext,
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Player date of birth cannot be in the future.');
    expect(ensureGuestChildUserDataMock).not.toHaveBeenCalled();
  });

  it('creates an adult free-agent registration without child fields', async () => {
    resolveEventDivisionSelectionMock.mockResolvedValueOnce({
      ok: true,
      selection: {
        divisionId: 'division_1',
        divisionTypeId: 'skill_open_age_18plus',
        divisionTypeKey: 'coed_skill_open_age_18plus',
        divisionName: 'Coed Open 18+',
      },
    });

    const response = await POST(
      requestFor({
        mode: 'free_agent',
        parent: {
          email: 'adult@test.com',
          firstName: 'Alex',
          lastName: 'Adult',
        },
        divisionId: 'division_1',
      }),
      routeContext,
    );

    expect(response.status).toBe(201);
    expect(ensureGuestChildUserDataMock).not.toHaveBeenCalled();
    expect(ensureGuestParentChildLinkMock).not.toHaveBeenCalled();
    expect(upsertEventRegistrationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'SELF',
      registrantId: 'parent_1',
      parentId: null,
      rosterRole: 'FREE_AGENT',
      createdBy: 'parent_1',
    }), txMock);
  });

  it('skips the document step when a free-agent participant already signed the required template', async () => {
    assertPublicWidgetEventMock.mockResolvedValueOnce({
      organization: {
        id: 'org_1',
        slug: 'summit',
        name: 'Summit United',
      },
      event: {
        id: 'event_1',
        name: 'Spring League',
        teamSignup: true,
        organizationId: 'org_1',
        start: new Date('2026-04-01T12:00:00.000Z'),
        requiredTemplateIds: ['participant_template'],
        price: 2500,
      },
    });
    resolveEventDivisionSelectionMock.mockResolvedValueOnce({
      ok: true,
      selection: {
        divisionId: 'division_1',
        divisionTypeId: 'skill_open_age_18plus',
        divisionTypeKey: 'coed_skill_open_age_18plus',
        divisionName: 'Coed Open 18+',
      },
    });
    resolveEventRegistrationPriceCentsMock.mockResolvedValueOnce(2500);
    prismaMock.templateDocuments.findMany.mockResolvedValueOnce([
      { id: 'participant_template', requiredSignerType: 'PARTICIPANT', signOnce: true },
    ]);
    txMock.signedDocuments.findMany.mockResolvedValueOnce([
      { status: 'SIGNED' },
    ]);
    upsertEventRegistrationMock.mockResolvedValueOnce({
      id: 'registration_1',
      eventId: 'event_1',
      registrantId: 'parent_1',
      registrantType: 'SELF',
      parentId: null,
      rosterRole: 'FREE_AGENT',
      status: 'STARTED',
    });

    const response = await POST(
      requestFor({
        mode: 'free_agent',
        parent: {
          email: 'adult@test.com',
          firstName: 'Alex',
          lastName: 'Adult',
        },
        divisionId: 'division_1',
      }),
      routeContext,
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(txMock.signedDocuments.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        templateId: 'participant_template',
        userId: 'parent_1',
        signerRole: 'participant',
        hostId: null,
      }),
    }));
    expect(upsertEventRegistrationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'SELF',
      registrantId: 'parent_1',
      status: 'STARTED',
      consentStatus: null,
    }), txMock);
    expect(dispatchRequiredEventDocumentsMock).not.toHaveBeenCalled();
    expect(payload.requiresPayment).toBe(true);
    expect(payload.requiresSigning).toBe(false);
    expect(payload.documentDispatches).toEqual([]);
  });

  it('creates a guest team and holds paid registration as started', async () => {
    resolveEventDivisionSelectionMock.mockResolvedValueOnce({
      ok: true,
      selection: {
        divisionId: 'division_1',
        divisionTypeId: 'skill_open_age_18plus',
        divisionTypeKey: 'coed_skill_open_age_18plus',
        divisionName: 'Coed Open 18+',
      },
    });
    resolveEventRegistrationPriceCentsMock.mockResolvedValueOnce(2500);
    ensureGuestParentIdentityMock.mockImplementation(async (_tx, input) => {
      const email = String(input?.email ?? '').toLowerCase();
      if (email === 'coach@test.com') {
        return { userId: 'coach_1', email, authUserExisted: false };
      }
      if (email === 'assistant@test.com') {
        return { userId: 'assistant_1', email, authUserExisted: false };
      }
      if (email === 'casey@test.com') {
        return { userId: 'player_1', email, authUserExisted: false };
      }
      if (email === 'riley@test.com') {
        return { userId: 'player_2', email, authUserExisted: false };
      }
      return { userId: 'parent_1', email: 'parent@test.com', authUserExisted: false };
    });
    upsertEventRegistrationMock.mockImplementation(async (params) => ({
      id: `${params.eventId}__${String(params.registrantType).toLowerCase()}__${params.registrantId}`,
      ...params,
    }));
    txMock.teamStaffAssignments.findMany.mockResolvedValueOnce([
      { id: 'staff_manager_1', userId: 'parent_1', role: 'MANAGER' },
      { id: 'staff_head_1', userId: 'coach_1', role: 'HEAD_COACH' },
      { id: 'staff_assistant_1', userId: 'assistant_1', role: 'ASSISTANT_COACH' },
    ]);

    const response = await POST(
      requestFor({
        mode: 'team',
        parent: {
          email: 'parent@test.com',
          firstName: 'Pat',
          lastName: 'Parent',
        },
        team: {
          name: 'Harbor Strikers',
          headCoach: {
            firstName: 'Harper',
            lastName: 'Coach',
            email: 'coach@test.com',
          },
          assistantCoaches: [
            {
              firstName: 'Avery',
              lastName: 'Assistant',
              email: 'assistant@test.com',
            },
          ],
          players: [
            {
              firstName: 'Casey',
              lastName: 'Player',
              email: 'casey@test.com',
              jerseyNumber: '7',
              position: 'Forward',
              isCaptain: true,
            },
            {
              firstName: 'Riley',
              lastName: 'Player',
              email: 'riley@test.com',
              jerseyNumber: '12',
              position: 'Goalkeeper',
            },
          ],
        },
        divisionId: 'division_1',
      }),
      routeContext,
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    const canonicalTeamId = txMock.canonicalTeams.create.mock.calls[0]?.[0]?.data?.id;
    const eventTeamId = txMock.teams.create.mock.calls[0]?.[0]?.data?.id;
    expect(txMock.canonicalTeams.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Harbor Strikers',
        organizationId: null,
        createdBy: 'parent_1',
        visibility: 'ADMIN_ONLY',
      }),
    });
    expect(txMock.teams.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: eventTeamId,
        eventId: 'event_1',
        kind: 'REGISTERED',
        name: 'Harbor Strikers',
        playerIds: ['player_1', 'player_2'],
        parentTeamId: canonicalTeamId,
        managerId: 'parent_1',
        headCoachId: 'coach_1',
        coachIds: ['assistant_1'],
      }),
    });
    expect(syncCanonicalTeamRosterMock).toHaveBeenCalledWith(expect.objectContaining({
      managerId: 'parent_1',
      headCoachId: 'coach_1',
      assistantCoachIds: ['assistant_1'],
      playerIds: ['player_1', 'player_2'],
      pendingPlayerIds: [],
    }), txMock);
    expect(applyCanonicalTeamRegistrationMetadataMock).toHaveBeenCalledWith(expect.objectContaining({
      client: txMock,
      playerRegistrations: expect.arrayContaining([
        expect.objectContaining({
          userId: 'player_1',
          parentId: null,
          registrantType: 'SELF',
          jerseyNumber: '7',
          position: 'Forward',
        }),
      ]),
    }));
    expect(upsertEventRegistrationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'TEAM',
      registrantId: eventTeamId,
      parentId: canonicalTeamId,
      eventTeamId,
      createdBy: 'parent_1',
      status: 'STARTED',
    }), txMock);
    expect(upsertEventRegistrationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'SELF',
      registrantId: 'player_1',
      parentId: null,
      eventTeamId,
      status: 'ACTIVE',
      sourceTeamRegistrationId: `${canonicalTeamId}__player_1`,
      jerseyNumber: '7',
      position: 'Forward',
      isCaptain: true,
    }), txMock);
    expect(ensureGuestParentChildLinkMock).not.toHaveBeenCalled();
    expect(txMock.eventTeamStaffAssignments.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        eventTeamId_userId_role: {
          eventTeamId,
          userId: 'coach_1',
          role: 'HEAD_COACH',
        },
      },
      create: expect.objectContaining({
        eventTeamId,
        userId: 'coach_1',
        role: 'HEAD_COACH',
        status: 'ACTIVE',
        sourceStaffAssignmentId: 'staff_head_1',
      }),
    }));
    expect(txMock.teams.update).toHaveBeenCalledWith({
      where: { id: eventTeamId },
      data: expect.objectContaining({
        playerRegistrationIds: expect.arrayContaining([
          `event_1__self__player_1`,
          `event_1__self__player_2`,
        ]),
        staffAssignmentIds: expect.arrayContaining([
          `${eventTeamId}__MANAGER__parent_1`,
          `${eventTeamId}__HEAD_COACH__coach_1`,
          `${eventTeamId}__ASSISTANT_COACH__assistant_1`,
        ]),
      }),
    });
    expect(payload.requiresPayment).toBe(true);
    expect(payload.team).toEqual(expect.objectContaining({
      eventTeamId,
      name: 'Harbor Strikers',
    }));
  });

  it('sends youth team roster document requests to guardian contacts after registration', async () => {
    assertPublicWidgetEventMock.mockResolvedValueOnce({
      organization: {
        id: 'org_1',
        slug: 'summit',
        name: 'Summit United',
      },
      event: {
        id: 'event_1',
        name: 'Spring League',
        teamSignup: true,
        organizationId: 'org_1',
        start: new Date('2026-04-01T12:00:00.000Z'),
        requiredTemplateIds: ['participant_template', 'guardian_template'],
        price: 0,
      },
    });
    prismaMock.templateDocuments.findMany.mockResolvedValueOnce([
      { id: 'participant_template', requiredSignerType: 'PARTICIPANT' },
      { id: 'guardian_template', requiredSignerType: 'PARENT_GUARDIAN' },
    ]);
    ensureGuestParentIdentityMock.mockImplementation(async (_tx, input) => {
      const email = String(input?.email ?? '').toLowerCase();
      if (email === 'guardian@test.com') {
        return { userId: 'guardian_1', email, authUserExisted: false };
      }
      if (email === 'guardian2@test.com') {
        return { userId: 'guardian_2', email, authUserExisted: false };
      }
      if (email === 'riley@test.com') {
        return { userId: 'player_2', email, authUserExisted: false };
      }
      return { userId: 'creator_1', email: 'creator@test.com', authUserExisted: false };
    });
    ensureGuestChildUserDataMock.mockResolvedValueOnce({ userId: 'child_1' });
    upsertEventRegistrationMock.mockImplementation(async (params) => ({
      id: `${params.eventId}__${String(params.registrantType).toLowerCase()}__${params.registrantId}`,
      ...params,
    }));
    dispatchRequiredEventDocumentsMock
      .mockResolvedValueOnce({
        firstDocumentId: 'guardian_document_1',
        sentDocumentIds: ['guardian_document_1'],
        missingChildEmail: false,
        errors: [],
      })
      .mockResolvedValueOnce({
        firstDocumentId: 'guardian_document_2',
        sentDocumentIds: ['guardian_document_2'],
        missingChildEmail: false,
        errors: [],
      });

    const response = await POST(
      requestFor({
        mode: 'team',
        parent: {
          email: 'creator@test.com',
          firstName: 'Taylor',
          lastName: 'Creator',
        },
        team: {
          name: 'Cascade Crew',
          players: [
            {
              firstName: 'Casey',
              lastName: 'Minor',
              dateOfBirth: '2015-05-10',
              guardianFirstName: 'Jordan',
              guardianLastName: 'Minor',
              guardianEmail: 'guardian@test.com',
              guardianRelationship: 'parent',
              jerseyNumber: '4',
            },
            {
              firstName: 'Riley',
              lastName: 'Minor',
              dateOfBirth: '2015-08-20',
              email: 'riley@test.com',
              guardianFirstName: 'Robin',
              guardianLastName: 'Minor',
              guardianEmail: 'guardian2@test.com',
              guardianRelationship: 'parent',
              jerseyNumber: '8',
            },
          ],
        },
        divisionId: 'division_1',
      }),
      routeContext,
    );
    const payload = await response.json();
    const canonicalTeamId = txMock.canonicalTeams.create.mock.calls[0]?.[0]?.data?.id;
    const eventTeamId = txMock.teams.create.mock.calls[0]?.[0]?.data?.id;

    expect(response.status).toBe(201);
    expect(ensureGuestParentChildLinkMock).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({
        parentId: 'guardian_1',
        childId: 'child_1',
        relationship: 'parent',
      }),
      expect.any(Date),
    );
    expect(ensureGuestParentChildLinkMock).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({
        parentId: 'guardian_2',
        childId: 'player_2',
        relationship: 'parent',
      }),
      expect.any(Date),
    );
    expect(applyCanonicalTeamRegistrationMetadataMock).toHaveBeenCalledWith(expect.objectContaining({
      playerRegistrations: expect.arrayContaining([
        expect.objectContaining({
          userId: 'child_1',
          parentId: 'guardian_1',
          registrantType: 'CHILD',
          jerseyNumber: '4',
          consentStatus: 'pending_send',
        }),
        expect.objectContaining({
          userId: 'player_2',
          parentId: 'guardian_2',
          registrantType: 'CHILD',
          jerseyNumber: '8',
          consentStatus: 'pending_send',
        }),
      ]),
    }));
    expect(upsertEventRegistrationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'TEAM',
      registrantId: eventTeamId,
      parentId: canonicalTeamId,
      status: 'STARTED',
      consentStatus: 'pending_send',
    }), txMock);
    expect(upsertEventRegistrationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'CHILD',
      registrantId: 'child_1',
      parentId: 'guardian_1',
      eventTeamId,
      status: 'STARTED',
      consentStatus: 'pending_send',
    }), txMock);
    expect(upsertEventRegistrationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'CHILD',
      registrantId: 'player_2',
      parentId: 'guardian_2',
      eventTeamId,
      status: 'STARTED',
      consentStatus: 'pending_send',
    }), txMock);
    expect(dispatchRequiredEventDocumentsMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      organizationId: 'org_1',
      requiredTemplateIds: ['guardian_template'],
      participantUserId: null,
      parentUserId: 'guardian_1',
      childUserId: 'child_1',
    }));
    expect(dispatchRequiredEventDocumentsMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      organizationId: 'org_1',
      requiredTemplateIds: ['guardian_template'],
      participantUserId: null,
      parentUserId: 'guardian_2',
      childUserId: 'player_2',
    }));
    expect(prismaMock.eventRegistrations.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'event_1__child__child_1' },
      data: expect.objectContaining({
        consentDocumentId: 'guardian_document_1',
        consentStatus: 'sent',
      }),
    }));
    expect(prismaMock.eventRegistrations.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'event_1__child__player_2' },
      data: expect.objectContaining({
        consentDocumentId: 'guardian_document_2',
        consentStatus: 'sent',
      }),
    }));
    expect(payload.requiresSigning).toBe(false);
    expect(payload.documentDispatches).toEqual(expect.arrayContaining([
      expect.objectContaining({ registrationId: 'event_1__child__child_1', status: 'sent' }),
      expect.objectContaining({ registrationId: 'event_1__child__player_2', status: 'sent' }),
    ]));
  });
});

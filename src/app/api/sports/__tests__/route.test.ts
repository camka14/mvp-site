/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  sports: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  events: {
    updateMany: jest.fn(),
  },
  divisions: {
    updateMany: jest.fn(),
  },
  teams: {
    updateMany: jest.fn(),
  },
  organizations: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '@/app/api/sports/route';

const basketballMatchRulesTemplate = {
  scoringModel: 'PERIODS',
  segmentCount: 4,
  segmentLabel: 'Quarter',
  supportsDraw: false,
  supportsOvertime: true,
  supportsShootout: false,
  canUseOvertime: true,
  canUseShootout: false,
  officialRoles: [],
  supportedIncidentTypes: ['POINT', 'DISCIPLINE', 'NOTE', 'ADMIN'],
  autoCreatePointIncidentType: 'POINT',
};

const basketballOfficialPositionTemplates = [
  { name: 'Referee', count: 2 },
  { name: 'Scorekeeper', count: 1 },
  { name: 'Timekeeper', count: 1 },
];

const basketballSkillDivisionTypes = [
  { id: 'rec', name: 'Recreational' },
  { id: 'open', name: 'Open' },
];

const baseballSkillDivisionTypes = [
  { id: 'aaa', name: 'AAA' },
  { id: 'open', name: 'Open' },
];

describe('GET /api/sports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockResolvedValue([]);
    prismaMock.sports.createMany.mockResolvedValue({ count: 0 });
    prismaMock.sports.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.events.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.divisions.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.teams.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.organizations.findMany.mockResolvedValue([]);
    prismaMock.organizations.update.mockResolvedValue({});
    prismaMock.sports.update.mockResolvedValue({});
  });

  it('seeds default sports without generic soccer/volleyball entries', async () => {
    prismaMock.sports.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'Indoor Soccer', name: 'Indoor Soccer' },
        { id: 'Indoor Volleyball', name: 'Indoor Volleyball' },
      ]);

    const response = await GET(new NextRequest('http://localhost/api/sports'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.sports.createMany).toHaveBeenCalledTimes(1);
    const createPayload = prismaMock.sports.createMany.mock.calls[0][0];
    const createdNames = Array.isArray(createPayload?.data)
      ? createPayload.data.map((row: any) => row.name)
      : [];
    const basketball = Array.isArray(createPayload?.data)
      ? createPayload.data.find((row: any) => row.id === 'Basketball')
      : null;
    const volleyball = Array.isArray(createPayload?.data)
      ? createPayload.data.find((row: any) => row.id === 'Indoor Volleyball')
      : null;
    const baseball = Array.isArray(createPayload?.data)
      ? createPayload.data.find((row: any) => row.id === 'Baseball')
      : null;
    const softball = Array.isArray(createPayload?.data)
      ? createPayload.data.find((row: any) => row.id === 'Softball')
      : null;
    const ultimate = Array.isArray(createPayload?.data)
      ? createPayload.data.find((row: any) => row.id === 'Ultimate Frisbee')
      : null;
    const beachSoccer = Array.isArray(createPayload?.data)
      ? createPayload.data.find((row: any) => row.id === 'Beach Soccer')
      : null;
    const football = Array.isArray(createPayload?.data)
      ? createPayload.data.find((row: any) => row.id === 'Football')
      : null;
    const tennis = Array.isArray(createPayload?.data)
      ? createPayload.data.find((row: any) => row.id === 'Tennis')
      : null;
    const pickleball = Array.isArray(createPayload?.data)
      ? createPayload.data.find((row: any) => row.id === 'Pickleball')
      : null;
    expect(createdNames).not.toContain('Soccer');
    expect(createdNames).not.toContain('Volleyball');
    expect(basketball?.usePointsPerGoalScored).toBe(false);
    expect(basketball?.usePointsPerGoalConceded).toBe(false);
    expect(basketball?.skillDivisionTypes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'rec', name: 'Recreational' }),
        expect.objectContaining({ id: 'open', name: 'Open' }),
      ]),
    );
    expect(basketball?.matchRulesTemplate).toEqual(
      expect.objectContaining({
        supportsOvertime: true,
        canUseOvertime: true,
        canUseShootout: false,
      }),
    );
    expect(basketball?.officialPositionTemplates).toEqual(basketballOfficialPositionTemplates);
    expect(volleyball?.matchRulesTemplate).toEqual(
      expect.objectContaining({
        supportsOvertime: false,
        supportsShootout: false,
        canUseOvertime: false,
        canUseShootout: false,
      }),
    );
    expect(baseball?.matchRulesTemplate).toEqual(
      expect.objectContaining({
        scoringModel: 'INNINGS',
        segmentCount: 9,
        segmentLabel: 'Inning',
        autoCreatePointIncidentType: 'RUN',
      }),
    );
    expect(softball?.matchRulesTemplate).toEqual(
      expect.objectContaining({
        scoringModel: 'INNINGS',
        segmentCount: 7,
        segmentLabel: 'Inning',
        autoCreatePointIncidentType: 'RUN',
      }),
    );
    expect(ultimate?.matchRulesTemplate).toEqual(
      expect.objectContaining({
        scoringModel: 'POINTS_ONLY',
        segmentCount: 1,
        segmentLabel: 'Game',
        autoCreatePointIncidentType: 'GOAL',
        supportedIncidentTypes: expect.arrayContaining(['GOAL', 'STALL_VIOLATION', 'FOUL', 'MISCONDUCT']),
      }),
    );
    expect(beachSoccer?.matchRulesTemplate).toEqual(
      expect.objectContaining({
        scoringModel: 'PERIODS',
        segmentCount: 3,
        segmentLabel: 'Period',
        supportsDraw: false,
        supportsOvertime: true,
        supportsShootout: true,
        timekeeping: expect.objectContaining({
          timerMode: 'COUNT_UP',
          segmentDurationMinutes: 12,
          canUseAddedTime: false,
          addedTimeEnabled: false,
        }),
      }),
    );
    expect(football?.matchRulesTemplate).toEqual(
      expect.objectContaining({
        segmentCount: 4,
        segmentLabel: 'Quarter',
        timekeeping: expect.objectContaining({ segmentDurationMinutes: 15 }),
        supportedIncidentTypes: expect.arrayContaining(['TARGETING', 'EJECTION']),
      }),
    );
    expect(tennis?.matchRulesTemplate).toEqual(
      expect.objectContaining({
        supportedIncidentTypes: expect.arrayContaining(['WARNING', 'POINT_PENALTY', 'GAME_PENALTY', 'DEFAULT']),
      }),
    );
    expect(pickleball?.matchRulesTemplate).toEqual(
      expect.objectContaining({
        supportedIncidentTypes: expect.arrayContaining(['TECHNICAL_WARNING', 'TECHNICAL_FOUL', 'FORFEIT']),
      }),
    );
    expect(baseball?.officialPositionTemplates).toEqual([
      { name: 'Plate Umpire', count: 1 },
      { name: 'Base Umpire', count: 2 },
    ]);
    expect(softball?.officialPositionTemplates).toEqual([
      { name: 'Plate Umpire', count: 1 },
      { name: 'Base Umpire', count: 2 },
    ]);
    expect(ultimate?.officialPositionTemplates).toEqual([
      { name: 'Observer', count: 1 },
    ]);
    expect(payload.sports.map((sport: any) => sport.name)).toEqual(
      expect.arrayContaining(['Indoor Soccer', 'Indoor Volleyball']),
    );
  });

  it('serializes one canonical row for case and whitespace duplicate sport names', async () => {
    const duplicateSports = [
      {
        id: 'sport_indoor_volleyball_duplicate',
        name: ' indoor volleyball ',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        matchRulesTemplate: { scoringModel: 'SETS' },
      },
      {
        id: 'Indoor Volleyball',
        name: 'Indoor Volleyball',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        matchRulesTemplate: null,
      },
    ];
    prismaMock.sports.findMany
      .mockResolvedValueOnce(duplicateSports)
      .mockResolvedValueOnce(duplicateSports);

    const response = await GET(new NextRequest('http://localhost/api/sports'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.sports).toEqual([
      expect.objectContaining({ id: 'Indoor Volleyball', name: 'Indoor Volleyball' }),
    ]);
  });

  it('remaps legacy references and removes deprecated sports', async () => {
    const seededSports = [
      { id: 'Soccer', name: 'Soccer' },
      { id: 'Volleyball', name: 'Volleyball' },
      { id: 'Indoor Soccer', name: 'Indoor Soccer' },
      { id: 'Indoor Volleyball', name: 'Indoor Volleyball' },
    ];
    prismaMock.sports.findMany
      .mockResolvedValueOnce(seededSports)
      .mockResolvedValueOnce(seededSports)
      .mockResolvedValueOnce([
        { id: 'Indoor Soccer', name: 'Indoor Soccer' },
        { id: 'Indoor Volleyball', name: 'Indoor Volleyball' },
      ]);
    prismaMock.organizations.findMany.mockResolvedValueOnce([
      { id: 'org_1', sports: ['Soccer', 'Volleyball', 'Basketball'] },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/sports'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.events.updateMany).toHaveBeenCalled();
    expect(prismaMock.divisions.updateMany).toHaveBeenCalled();
    expect(prismaMock.teams.updateMany).toHaveBeenCalled();
    expect(prismaMock.organizations.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'org_1' },
        data: { sports: ['Indoor Soccer', 'Indoor Volleyball', 'Basketball'] },
      }),
    );
    expect(prismaMock.sports.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['Soccer', 'Volleyball'] } },
    });
    expect(payload.sports.map((sport: any) => sport.name)).toEqual([
      'Indoor Soccer',
      'Indoor Volleyball',
    ]);
  });

  it('does not overwrite explicit scoring flags from the database', async () => {
    const seededSports = [
      {
        id: 'Basketball',
        name: 'Basketball',
        skillDivisionTypes: basketballSkillDivisionTypes,
        officialPositionTemplates: basketballOfficialPositionTemplates,
        matchRulesTemplate: basketballMatchRulesTemplate,
        usePointsForWin: true,
        usePointsForLoss: true,
        usePointsPerGoalScored: true,
        usePointsPerGoalConceded: true,
      },
    ];
    prismaMock.sports.findMany
      .mockResolvedValueOnce(seededSports)
      .mockResolvedValueOnce(seededSports);

    const response = await GET(new NextRequest('http://localhost/api/sports'));

    expect(response.status).toBe(200);
    expect(prismaMock.sports.update).toHaveBeenCalledWith({
      where: { id: 'Basketball' },
      data: {
        matchRulesTemplate: expect.objectContaining({
          scoringModel: 'PERIODS',
          supportedIncidentTypes: expect.arrayContaining([
            'POINT',
            'PERSONAL_FOUL',
            'TECHNICAL_FOUL',
            'FLAGRANT_FOUL',
            'EJECTION',
            'NOTE',
            'ADMIN',
          ]),
          incidentTypeDefinitions: expect.arrayContaining([
            expect.objectContaining({ code: 'TECHNICAL_FOUL', label: 'Technical foul' }),
            expect.objectContaining({ code: 'EJECTION', cardColor: 'red' }),
          ]),
          timekeeping: expect.objectContaining({
            timerMode: 'COUNT_UP',
            segmentDurationMinutes: 10,
            canUseAddedTime: false,
          }),
        }),
      },
    });
    const updateData = prismaMock.sports.update.mock.calls[0]?.[0]?.data ?? {};
    expect(updateData).not.toHaveProperty('usePointsForWin');
    expect(updateData).not.toHaveProperty('usePointsForLoss');
    expect(updateData).not.toHaveProperty('usePointsPerGoalScored');
    expect(updateData).not.toHaveProperty('usePointsPerGoalConceded');
  });

  it('backfills null scoring flags using default sport settings', async () => {
    const seededSports = [
      {
        id: 'Basketball',
        name: 'Basketball',
        skillDivisionTypes: basketballSkillDivisionTypes,
        officialPositionTemplates: basketballOfficialPositionTemplates,
        matchRulesTemplate: basketballMatchRulesTemplate,
        usePointsForWin: null,
        usePointsForLoss: null,
        usePointsPerGoalScored: null,
        usePointsPerGoalConceded: null,
      },
    ];
    prismaMock.sports.findMany
      .mockResolvedValueOnce(seededSports)
      .mockResolvedValueOnce([
        {
          ...seededSports[0],
          usePointsForWin: true,
          usePointsForLoss: true,
          usePointsPerGoalScored: false,
          usePointsPerGoalConceded: false,
        },
      ]);

    const response = await GET(new NextRequest('http://localhost/api/sports'));

    expect(response.status).toBe(200);
    expect(prismaMock.sports.update).toHaveBeenCalledWith({
      where: { id: 'Basketball' },
      data: expect.objectContaining({
        usePointsForWin: true,
        usePointsForLoss: true,
        usePointsPerGoalScored: false,
        usePointsPerGoalConceded: false,
        matchRulesTemplate: expect.objectContaining({
          incidentTypeDefinitions: expect.arrayContaining([
            expect.objectContaining({ code: 'PERSONAL_FOUL' }),
          ]),
          timekeeping: expect.objectContaining({ timerMode: 'COUNT_UP' }),
        }),
      }),
    });
  });

  it('backfills null official position templates using default sport settings', async () => {
    const seededSports = [
      {
        id: 'Basketball',
        name: 'Basketball',
        skillDivisionTypes: basketballSkillDivisionTypes,
        officialPositionTemplates: null,
        matchRulesTemplate: basketballMatchRulesTemplate,
        usePointsForWin: true,
        usePointsForLoss: true,
        usePointsPerGoalScored: false,
        usePointsPerGoalConceded: false,
      },
    ];
    prismaMock.sports.findMany
      .mockResolvedValueOnce(seededSports)
      .mockResolvedValueOnce([
        {
          ...seededSports[0],
          officialPositionTemplates: basketballOfficialPositionTemplates,
        },
      ]);

    const response = await GET(new NextRequest('http://localhost/api/sports'));

    expect(response.status).toBe(200);
    expect(prismaMock.sports.update).toHaveBeenCalledWith({
      where: { id: 'Basketball' },
      data: expect.objectContaining({
        officialPositionTemplates: basketballOfficialPositionTemplates,
        matchRulesTemplate: expect.objectContaining({
          incidentTypeDefinitions: expect.arrayContaining([
            expect.objectContaining({ code: 'TECHNICAL_FOUL' }),
          ]),
          timekeeping: expect.objectContaining({ segmentDurationMinutes: 10 }),
        }),
      }),
    });
  });

  it('backfills missing match rule template fields using default sport settings', async () => {
    const seededSports = [
      {
        id: 'Baseball',
        name: 'Baseball',
        skillDivisionTypes: baseballSkillDivisionTypes,
        officialPositionTemplates: [
          { name: 'Plate Umpire', count: 1 },
          { name: 'Base Umpire', count: 2 },
        ],
        matchRulesTemplate: {
          scoringModel: 'INNINGS',
        },
        usePointsForWin: true,
        usePointsForLoss: true,
        usePointsPerGoalScored: false,
        usePointsPerGoalConceded: false,
      },
    ];
    prismaMock.sports.findMany
      .mockResolvedValueOnce(seededSports)
      .mockResolvedValueOnce([
        {
          ...seededSports[0],
          matchRulesTemplate: {
            scoringModel: 'INNINGS',
            segmentCount: 9,
            segmentLabel: 'Inning',
            supportsDraw: false,
            supportsOvertime: false,
            supportsShootout: false,
            canUseOvertime: false,
            canUseShootout: false,
            officialRoles: [],
            supportedIncidentTypes: ['RUN', 'WARNING', 'EJECTION', 'NOTE', 'ADMIN'],
            incidentTypeDefinitions: [
              {
                code: 'RUN',
                label: 'Run',
                kind: 'SCORING',
                requiresTeam: true,
                requiresParticipant: false,
                defaultEnabled: true,
                linkedPointDelta: 1,
              },
              {
                code: 'WARNING',
                label: 'Warning',
                kind: 'DISCIPLINE',
                requiresTeam: true,
                requiresParticipant: false,
                defaultEnabled: true,
              },
              {
                code: 'EJECTION',
                label: 'Ejection',
                kind: 'DISCIPLINE',
                requiresTeam: true,
                requiresParticipant: false,
                defaultEnabled: true,
                cardColor: 'red',
              },
              { code: 'NOTE', label: 'Match note', kind: 'NOTE', defaultEnabled: true },
              { code: 'ADMIN', label: 'Admin note', kind: 'ADMIN', defaultEnabled: true },
            ],
            autoCreatePointIncidentType: 'RUN',
            timekeeping: {
              timerMode: 'NONE',
              segmentDurationMinutes: null,
              segmentDurationMinutesBySequence: [],
              canUseAddedTime: false,
              addedTimeEnabled: false,
              stopAtRegulationEnd: true,
            },
          },
        },
      ]);

    const response = await GET(new NextRequest('http://localhost/api/sports'));

    expect(response.status).toBe(200);
    expect(prismaMock.sports.update).toHaveBeenCalledWith({
      where: { id: 'Baseball' },
      data: {
        matchRulesTemplate: expect.objectContaining({
          scoringModel: 'INNINGS',
          segmentCount: 9,
          segmentLabel: 'Inning',
          supportsDraw: false,
          supportsOvertime: false,
          supportsShootout: false,
          canUseOvertime: false,
          canUseShootout: false,
          officialRoles: [],
          supportedIncidentTypes: ['RUN', 'WARNING', 'EJECTION', 'NOTE', 'ADMIN'],
          incidentTypeDefinitions: expect.arrayContaining([
            expect.objectContaining({ code: 'RUN', kind: 'SCORING' }),
            expect.objectContaining({ code: 'WARNING', kind: 'DISCIPLINE' }),
            expect.objectContaining({ code: 'EJECTION', cardColor: 'red' }),
          ]),
          autoCreatePointIncidentType: 'RUN',
          timekeeping: expect.objectContaining({
            timerMode: 'NONE',
            segmentDurationMinutes: null,
            canUseAddedTime: false,
            addedTimeEnabled: false,
            stopAtRegulationEnd: true,
          }),
        }),
      },
    });
  });
});

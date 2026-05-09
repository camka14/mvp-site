/** @jest-environment node */

const prismaMock = {
  sports: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '@/app/api/division-types/route';

describe('GET /api/division-types', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.sports.createMany.mockResolvedValue({ count: 0 });
    prismaMock.sports.update.mockResolvedValue({});
    prismaMock.$transaction.mockResolvedValue([]);
  });

  it('returns global genders, global ages, and sport-owned skills', async () => {
    prismaMock.sports.findMany
      .mockResolvedValueOnce([
        {
          id: 'Football',
          name: 'Football',
          skillDivisionTypes: [
            { id: 'flag', name: 'Flag' },
            { id: 'tackle', name: 'Tackle' },
          ],
        },
        {
          id: 'Beach Volleyball',
          name: 'Beach Volleyball',
          skillDivisionTypes: [
            { id: 'open', name: 'Open' },
            { id: 'aa', name: 'AA' },
          ],
        },
        {
          id: 'Custom Sport',
          name: 'Custom Sport',
          skillDivisionTypes: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'Football',
          name: 'Football',
          skillDivisionTypes: [
            { id: 'flag', name: 'Flag' },
            { id: 'tackle', name: 'Tackle' },
          ],
        },
        {
          id: 'Beach Volleyball',
          name: 'Beach Volleyball',
          skillDivisionTypes: [
            { id: 'open', name: 'Open' },
            { id: 'aa', name: 'AA' },
          ],
        },
        {
          id: 'Custom Sport',
          name: 'Custom Sport',
          skillDivisionTypes: [],
        },
      ]);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.genders).toEqual([
      { id: 'M', name: 'Men' },
      { id: 'F', name: 'Women' },
      { id: 'C', name: 'Coed' },
    ]);
    expect(payload.ages).toEqual(
      expect.arrayContaining([
        { id: 'u10', name: 'U10' },
        { id: '18plus', name: '18+' },
      ]),
    );
    expect(payload.sportSkills).toEqual([
      {
        sportId: 'Football',
        skills: [
          { id: 'flag', name: 'Flag' },
          { id: 'tackle', name: 'Tackle' },
        ],
      },
      {
        sportId: 'Beach Volleyball',
        skills: [
          { id: 'open', name: 'Open' },
          { id: 'aa', name: 'AA' },
        ],
      },
      {
        sportId: 'Custom Sport',
        skills: [],
      },
    ]);
  });
});

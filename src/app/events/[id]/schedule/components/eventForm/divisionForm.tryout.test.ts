import { buildTryoutDivisionSnapshot } from './divisionForm';

describe('buildTryoutDivisionSnapshot', () => {
  it('copies eligibility metadata but starts with a zero tryout fee', () => {
    const snapshot = buildTryoutDivisionSnapshot({
      eventId: 'tryout_1',
      existingDivisionIds: [],
      sourceDivision: {
        id: 'club_division_1',
        name: 'Girls U14 Competitive',
        scope: 'ORGANIZATION',
        status: 'ACTIVE',
        sportId: 'soccer',
        gender: 'F',
        skillDivisionTypeId: 'competitive',
        ageDivisionTypeId: 'u14',
        price: 125000,
        maxParticipants: 24,
      },
    });

    expect(snapshot).toEqual(expect.objectContaining({
      sourceDivisionId: 'club_division_1',
      name: 'Girls U14 Competitive',
      gender: 'F',
      skillDivisionTypeId: 'competitive',
      ageDivisionTypeId: 'u14',
      price: 0,
      maxParticipants: 24,
    }));
    expect(snapshot.id).toContain('tryout_1');
  });
});

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import { normalizeOrganizationDivisionInput, OrganizationDivisionValidationError } from '@/server/organizationDivisions';

const client = {
  sports: {
    findUnique: jest.fn(),
  },
};

describe('normalizeOrganizationDivisionInput', () => {
  beforeEach(() => {
    client.sports.findUnique.mockReset();
    client.sports.findUnique.mockResolvedValue({
      id: 'Grass Soccer',
      skillDivisionTypes: [
        { id: 'rec', name: 'Recreational' },
        { id: 'premier', name: 'Premier' },
        { id: 'open', name: 'Open' },
      ],
    });
  });

  it('preserves a custom division name while storing a strict filter skill', async () => {
    await expect(normalizeOrganizationDivisionInput({
      name: '2013 Girls Navy',
      sportId: 'Grass Soccer',
      gender: 'F',
      skillDivisionTypeId: 'premier',
      ageDivisionTypeId: 'u13',
      price: 195000,
    }, client)).resolves.toEqual(expect.objectContaining({
      name: '2013 Girls Navy',
      skillDivisionTypeId: 'premier',
      ageDivisionTypeId: 'u13',
    }));
  });

  it('rejects a free-form skill even when the custom division name is valid', async () => {
    await expect(normalizeOrganizationDivisionInput({
      name: '2013 Girls Navy',
      sportId: 'Grass Soccer',
      gender: 'F',
      skillDivisionTypeId: 'navy_competitive_pathway',
      ageDivisionTypeId: 'u13',
      price: 195000,
    }, client)).rejects.toBeInstanceOf(OrganizationDivisionValidationError);
  });
});

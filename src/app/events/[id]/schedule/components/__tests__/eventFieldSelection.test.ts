import {
  requiresOrganizationEventFieldSelection,
  resolveOrganizationEventFieldIds,
} from '../eventFieldSelection';

describe('eventFieldSelection', () => {
  describe('resolveOrganizationEventFieldIds', () => {
    it('keeps explicit selected field ids when they are valid', () => {
      expect(
        resolveOrganizationEventFieldIds(
          ['field_2', 'field_1'],
          ['field_1', 'field_2', 'field_3'],
        ),
      ).toEqual(['field_2', 'field_1']);
    });

    it('falls back to all available field ids when no valid selection is provided', () => {
      expect(
        resolveOrganizationEventFieldIds(
          ['missing'],
          ['field_1', 'field_2'],
        ),
      ).toEqual(['field_1', 'field_2']);
    });
  });

  describe('requiresOrganizationEventFieldSelection', () => {
    it('requires selection for organization regular events', () => {
      expect(
        requiresOrganizationEventFieldSelection('EVENT', 'org_1', []),
      ).toBe(true);
    });

    it('does not require selection for non-organization events', () => {
      expect(
        requiresOrganizationEventFieldSelection('EVENT', undefined, []),
      ).toBe(false);
    });

    it('does not require selection for non-regular events', () => {
      expect(
        requiresOrganizationEventFieldSelection('LEAGUE', 'org_1', []),
      ).toBe(false);
    });
  });
});


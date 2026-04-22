import { Field } from '@/types';
import {
  getFieldOrganizationId,
  hasExternalRentalFieldForEvent,
} from '../externalRentalField';

const makeField = (overrides: Partial<Field> = {}): Field => ({
  $id: 'field_1',
  name: 'Field 1',
  location: '',
  lat: 0,
  long: 0,
  ...overrides,
});

describe('externalRentalField', () => {
  describe('getFieldOrganizationId', () => {
    it('reads organization id when field.organization is a string id', () => {
      const field = makeField({ organization: 'org_rental' as any });
      expect(getFieldOrganizationId(field)).toBe('org_rental');
    });

    it('reads organization id when field.organization is an object', () => {
      const field = makeField({ organization: { $id: 'org_rental' } as any });
      expect(getFieldOrganizationId(field)).toBe('org_rental');
    });
  });

  describe('hasExternalRentalFieldForEvent', () => {
    it('detects external rental fields from explicit field ownership', () => {
      const result = hasExternalRentalFieldForEvent({
        eventOrganizationId: 'org_host',
        sourceFields: [makeField({ organization: 'org_rental' as any })],
        organizationFieldIds: ['field_host'],
        referencedFieldIds: ['field_host'],
        isEditMode: true,
      });

      expect(result).toBe(true);
    });

    it('detects external rental fields from referenced field ids during edit mode', () => {
      const result = hasExternalRentalFieldForEvent({
        eventOrganizationId: 'org_host',
        sourceFields: [makeField()],
        organizationFieldIds: ['field_host'],
        referencedFieldIds: ['field_host', 'field_external'],
        isEditMode: true,
      });

      expect(result).toBe(true);
    });

    it('does not infer external rental fields from referenced ids in create mode', () => {
      const result = hasExternalRentalFieldForEvent({
        eventOrganizationId: 'org_host',
        sourceFields: [makeField()],
        organizationFieldIds: ['field_host'],
        referencedFieldIds: ['field_external'],
        isEditMode: false,
      });

      expect(result).toBe(false);
    });

    it('treats organization-owned fields as external when the event has no organization id', () => {
      const result = hasExternalRentalFieldForEvent({
        eventOrganizationId: '',
        sourceFields: [makeField({ organization: 'org_rental' as any })],
        organizationFieldIds: [],
        referencedFieldIds: ['field_1'],
        isEditMode: true,
      });

      expect(result).toBe(true);
    });

    it('does not mark local fields as external when the event has no organization id', () => {
      const result = hasExternalRentalFieldForEvent({
        eventOrganizationId: '',
        sourceFields: [makeField()],
        organizationFieldIds: [],
        referencedFieldIds: ['field_1'],
        isEditMode: true,
      });

      expect(result).toBe(false);
    });

    it('infers external rental fields from source-field ownership when org field ids are unavailable', () => {
      const result = hasExternalRentalFieldForEvent({
        eventOrganizationId: 'org_host',
        sourceFields: [makeField({ $id: 'field_host', organization: 'org_host' as any })],
        organizationFieldIds: [],
        referencedFieldIds: ['field_host', 'field_external'],
        isEditMode: true,
      });

      expect(result).toBe(true);
    });
  });
});

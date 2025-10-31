'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Button, Group, TextInput, NumberInput, Select } from '@mantine/core';
import type { Field, Organization } from '@/types';
import { fieldService } from '@/lib/fieldService';

interface CreateFieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  organization?: Organization;
  field?: Field | null;
  onFieldSaved?: (field: Field) => void;
}

type FieldFormState = {
  $id?: string;
  name: string;
  type: string;
  location: string;
  lat: string | number;
  long: string | number;
  fieldNumber: number;
  organization?: Organization;
};

const createEmptyState = (organization?: Organization): FieldFormState => ({
  $id: undefined,
  name: '',
  type: 'indoor',
  location: '',
  lat: '',
  long: '',
  fieldNumber: 1,
  organization: organization
});

export default function CreateFieldModal(props: CreateFieldModalProps) {
  const { isOpen, onClose, organization, field, onFieldSaved } = props;
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FieldFormState>(() => createEmptyState(organization));

  const isEditMode = useMemo(() => Boolean(field?.$id), [field]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (field) {
      setForm({
        $id: field.$id,
        name: field.name || '',
        type: field.type || 'indoor',
        location: field.location || '',
        lat: typeof field.lat === 'number' ? field.lat : '',
        long: typeof field.long === 'number' ? field.long : '',
        fieldNumber: typeof field.fieldNumber === 'number' ? field.fieldNumber : 1,
        organization: field.organization
      });
    } else {
      setForm(createEmptyState(organization));
    }
  }, [isOpen, field, organization]);

  const isValid = form.name.trim().length > 0 && form.fieldNumber > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        $id: form.$id,
        name: form.name.trim(),
        type: form.type,
        location: form.location.trim() || undefined,
        lat: form.lat === '' ? undefined : Number(form.lat),
        long: form.long === '' ? undefined : Number(form.long),
        fieldNumber: Number(form.fieldNumber),
        organization: form.organization || undefined,
      };
      const saved = await fieldService.createField(payload);
      onFieldSaved?.(saved);
      onClose();
      setForm(createEmptyState(organization));
    } catch (err) {
      console.error('Failed to create field:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal opened={isOpen} onClose={onClose} title={isEditMode ? 'Update Field' : 'Create Field'} size="md" centered>
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextInput
          label="Name"
          placeholder="Court 1, Field A, etc."
          value={form.name}
          onChange={(e) => {
            const value = e.currentTarget.value;
            setForm(prev => ({ ...prev, name: value }));
          }}
          required
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Type"
            data={[{ value: 'indoor', label: 'Indoor' }, { value: 'outdoor', label: 'Outdoor' }]}
            value={form.type}
            onChange={(value) => setForm(prev => ({ ...prev, type: value || prev.type }))}
          />
          <NumberInput
            label="Field Number"
            min={1}
            value={form.fieldNumber}
            onChange={(val) => setForm(prev => ({ ...prev, fieldNumber: Math.max(1, Number(val) || 1) }))}
            required
          />
        </div>

        <TextInput
          label="Location (optional)"
          placeholder="123 Main St, City"
          value={form.location}
          onChange={(e) => {
            const value = e.currentTarget.value;
            setForm(prev => ({ ...prev, location: value }));
          }}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumberInput
            label="Latitude (optional)"
            value={form.lat as number | string}
            onChange={(val) => setForm(prev => ({ ...prev, lat: (val as number) ?? '' }))}
            step={0.000001}
          />
          <NumberInput
            label="Longitude (optional)"
            value={form.long as number | string}
            onChange={(val) => setForm(prev => ({ ...prev, long: (val as number) ?? '' }))}
            step={0.000001}
          />
        </div>

        <Group justify="space-between" pt="sm">
          <Button variant="default" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" disabled={!isValid || submitting}>
            {submitting ? (isEditMode ? 'Saving…' : 'Creating…') : (isEditMode ? 'Update Field' : 'Create Field')}
          </Button>
        </Group>
      </form>
    </Modal>
  );
}

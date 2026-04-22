'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Button, Group, TextInput } from '@mantine/core';
import type { Field, Organization } from '@/types';
import { fieldService } from '@/lib/fieldService';
import LocationSelector from '@/components/location/LocationSelector';

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
  location: string;
  lat: string | number;
  long: string | number;
  organization?: Organization;
};

const createEmptyState = (organization?: Organization): FieldFormState => ({
  $id: undefined,
  name: '',
  location: '',
  lat: '',
  long: '',
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
        location: field.location || '',
        lat: typeof field.lat === 'number' ? field.lat : '',
        long: typeof field.long === 'number' ? field.long : '',
        organization: field.organization
      });
    } else {
      setForm(createEmptyState(organization));
    }
  }, [isOpen, field, organization]);

  const isValid = form.name.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        $id: form.$id,
        name: form.name.trim(),
        location: form.location.trim() || undefined,
        lat: form.lat === '' ? undefined : Number(form.lat),
        long: form.long === '' ? undefined : Number(form.long),
        organization: form.organization || undefined,
      };
      const saved = isEditMode && payload.$id
        ? await fieldService.updateField({
            $id: payload.$id,
            name: payload.name,
            location: payload.location,
            lat: payload.lat,
            long: payload.long,
          })
        : await fieldService.createField(payload);
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

        <LocationSelector
          value={form.location}
          coordinates={{
            lat: form.lat ? Number(form.lat) : 0,
            lng: form.long ? Number(form.long) : 0,
          }}
          label="Location (optional)"
          onChange={(location, lat, lng) => {
            setForm(prev => ({
              ...prev,
              location,
              lat,
              long: lng,
            }));
          }}
          isValid
        />

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

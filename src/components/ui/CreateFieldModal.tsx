'use client';

import React, { useState } from 'react';
import { Modal, Button, Group, TextInput, NumberInput, Select } from '@mantine/core';
import type { Field } from '@/types';
import { fieldService } from '@/lib/fieldService';

interface CreateFieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId?: string;
  onFieldCreated?: (field: Field) => void;
}

export default function CreateFieldModal({ isOpen, onClose, organizationId, onFieldCreated }: CreateFieldModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: 'indoor',
    location: '',
    lat: '' as string | number,
    long: '' as string | number,
    fieldNumber: 1,
    organizationId: organizationId || ''
  });

  const isValid = form.name.trim().length > 0 && form.fieldNumber > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        location: form.location.trim() || undefined,
        lat: form.lat === '' ? undefined : Number(form.lat),
        long: form.long === '' ? undefined : Number(form.long),
        fieldNumber: Number(form.fieldNumber),
        organizationId: form.organizationId || undefined,
      };
      const created = await fieldService.createField(payload);
      onFieldCreated?.(created);
      onClose();
      setForm({ name: '', type: 'indoor', location: '', lat: '', long: '', fieldNumber: 1, organizationId: organizationId || '' });
    } catch (err) {
      console.error('Failed to create field:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal opened={isOpen} onClose={onClose} title="Create Field" size="md" centered>
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextInput
          label="Name"
          placeholder="Court 1, Field A, etc."
          value={form.name}
          onChange={(e) => setForm(prev => ({ ...prev, name: e.currentTarget.value }))}
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
          onChange={(e) => setForm(prev => ({ ...prev, location: e.currentTarget.value }))}
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

        {!organizationId && (
          <TextInput
            label="Organization ID (optional)"
            placeholder="Link this field to an organization"
            value={form.organizationId}
            onChange={(e) => setForm(prev => ({ ...prev, organizationId: e.currentTarget.value }))}
          />
        )}

        <Group justify="space-between" pt="sm">
          <Button variant="default" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" disabled={!isValid || submitting}>{submitting ? 'Creating…' : 'Create Field'}</Button>
        </Group>
      </form>
    </Modal>
  );
}

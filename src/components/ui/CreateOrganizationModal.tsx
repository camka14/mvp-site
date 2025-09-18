'use client';

import React, { useState } from 'react';
import { Modal, Button, Group, TextInput, Textarea } from '@mantine/core';
import type { Organization, UserData } from '@/types';
import { organizationService } from '@/lib/organizationService';
import { ImageUploader } from './ImageUploader';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserData;
  onCreated?: (org: Organization) => void;
}

export default function CreateOrganizationModal({ isOpen, onClose, currentUser, onCreated }: Props) {
  const [creating, setCreating] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [form, setForm] = useState({
    name: '',
    description: '',
    website: '',
    location: '',
    lat: '' as string | number,
    long: '' as string | number,
    logoId: '',
  });

  const extractFileIdFromUrl = (url: string): string => {
    try {
      const match = url.match(/\/files\/([^/]+)\/preview/);
      return match ? match[1] : '';
    } catch {
      return '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const org = await organizationService.createOrganization({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        website: form.website.trim() || undefined,
        location: form.location.trim() || undefined,
        lat: form.lat ? Number(form.lat) : undefined,
        long: form.long ? Number(form.long) : undefined,
        logoId: form.logoId || undefined,
        ownerId: currentUser.$id,
      });
      onCreated?.(org);
      setForm({ name: '', description: '', website: '', location: '', lat: '', long: '', logoId: '' });
      setLogoUrl('');
      onClose();
    } catch (e) {
      console.error('Failed to create organization', e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal opened={isOpen} onClose={onClose} title="Create Organization" size="md" centered>
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextInput
          label="Name"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.currentTarget.value }))}
          placeholder="Organization name"
          required
          maxLength={80}
        />
        <Textarea
          label="Description"
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.currentTarget.value }))}
          placeholder="Tell people what your organization does"
          autosize minRows={3}
          maxLength={500}
        />
        <TextInput
          label="Website"
          value={form.website}
          onChange={(e) => setForm((p) => ({ ...p, website: e.currentTarget.value }))}
          placeholder="https://example.com"
          type="url"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextInput
            label="Location"
            value={form.location}
            onChange={(e) => setForm((p) => ({ ...p, location: e.currentTarget.value }))}
            placeholder="City, State"
          />
          <div className="grid grid-cols-2 gap-3">
            <TextInput
              label="Lat"
              value={String(form.lat)}
              onChange={(e) => setForm((p) => ({ ...p, lat: e.currentTarget.value }))}
              placeholder="37.7749"
              inputMode="decimal"
            />
            <TextInput
              label="Long"
              value={String(form.long)}
              onChange={(e) => setForm((p) => ({ ...p, long: e.currentTarget.value }))}
              placeholder="-122.4194"
              inputMode="decimal"
            />
          </div>
        </div>
        <div>
          <label className="form-label">Logo</label>
          <ImageUploader
            currentImageUrl={logoUrl}
            bucketId={process.env.NEXT_PUBLIC_IMAGES_BUCKET_ID as string}
            className="w-full"
            placeholder="Upload or select a logo"
            onChange={(url) => {
              setLogoUrl(url);
              setForm((p) => ({ ...p, logoId: extractFileIdFromUrl(url) }));
            }}
          />
        </div>
        <Group justify="space-between" pt="sm">
          <Button variant="default" onClick={onClose} disabled={creating}>Cancel</Button>
          <Button type="submit" disabled={creating || !form.name.trim()}>{creating ? 'Creating…' : 'Create Organization'}</Button>
        </Group>
      </form>
    </Modal>
  );
}

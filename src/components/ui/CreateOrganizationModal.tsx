'use client';

import React, { useState } from 'react';
import ModalShell from './ModalShell';
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
    <ModalShell isOpen={isOpen} onClose={onClose} title="Create Organization" maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="form-label">Name</label>
          <input
            className="form-input"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Organization name"
            required
            maxLength={80}
          />
        </div>
        <div>
          <label className="form-label">Description</label>
          <textarea
            className="form-input"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="Tell people what your organization does"
            rows={3}
            maxLength={500}
          />
        </div>
        <div>
          <label className="form-label">Website</label>
          <input
            className="form-input"
            value={form.website}
            onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
            placeholder="https://example.com"
            type="url"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Location</label>
            <input
              className="form-input"
              value={form.location}
              onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
              placeholder="City, State"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Lat</label>
              <input
                className="form-input"
                value={form.lat}
                onChange={(e) => setForm((p) => ({ ...p, lat: e.target.value }))}
                placeholder="37.7749"
                inputMode="decimal"
              />
            </div>
            <div>
              <label className="form-label">Long</label>
              <input
                className="form-input"
                value={form.long}
                onChange={(e) => setForm((p) => ({ ...p, long: e.target.value }))}
                placeholder="-122.4194"
                inputMode="decimal"
              />
            </div>
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
        <div className="flex space-x-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1" disabled={creating}>Cancel</button>
          <button type="submit" className="btn-primary flex-1" disabled={creating || !form.name.trim()}>
            {creating ? 'Creating…' : 'Create Organization'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

